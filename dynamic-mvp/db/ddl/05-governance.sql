-- ============================================================
-- B3 — Admin Workflow：服务端治理规则（PostgreSQL 层）
--
-- 本文件只做两件事，均**不改变 V0.2 数据模型语义**：
--   1) last_updated 由数据库自动刷新（B3.3）
--      —— 明确要求"不要依赖浏览器前端更新时间"，因此放在 BEFORE UPDATE 触发器里；
--         任何写入路径（Directus App、REST API、psql）都会刷新，无法绕过。
--   2) 建立父实体状态视图，供 B3.4 的父子发布一致性做服务端校验（只读视图）
--
-- 禁止：修改任何业务字段、约束、索引、关系语义。
-- ============================================================

-- ---------- 1) last_updated 自动刷新 ----------
-- UPDATE  → 无条件刷新为 now()（写入即刷新，含仅改内容的编辑）
-- INSERT  → 仅在调用方未提供值时补 now()（保证种子迁移的原值不被覆盖）
CREATE OR REPLACE FUNCTION glp_touch_last_updated() RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'UPDATE' THEN
        NEW.last_updated := now();
    ELSIF TG_OP = 'INSERT' AND NEW.last_updated IS NULL THEN
        NEW.last_updated := now();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
    t text;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'country', 'library', 'award', 'award_result', 'case_project', 'source'
    ]
    LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS trg_%1$s_touch ON %1$I', t);
        EXECUTE format(
            'CREATE TRIGGER trg_%1$s_touch BEFORE INSERT OR UPDATE ON %1$I '
            'FOR EACH ROW EXECUTE FUNCTION glp_touch_last_updated()', t);
    END LOOP;
END $$;

COMMENT ON FUNCTION glp_touch_last_updated() IS
    'B3.3：任何内容写入（含仅改正文）都在数据库层刷新 last_updated，不依赖前端。';

-- ---------- 2) 父实体状态视图（B3.4 校验用，只读） ----------
-- 说明：父子发布一致性本身在 Directus 权限层实现（跨关系字段过滤），
--       这里额外给出"按治理规则应当公开"的期望集合，用于测试对拍。
CREATE OR REPLACE VIEW v_public_award_result AS
SELECT ar.*
FROM award_result ar
JOIN award   a ON a.award_id   = ar.award_id
JOIN library l ON l.library_id = ar.library_id
WHERE ar.status = 'published'
  AND a.status  = 'published'
  AND l.status  = 'published';

CREATE OR REPLACE VIEW v_public_case_project AS
SELECT c.*
FROM case_project c
JOIN library l ON l.library_id = c.library_id
WHERE c.status = 'published'
  AND l.status = 'published';

-- 关联表本身无 status：公开集合 = 父实体处于上述"应当公开"集合中的关联行
CREATE OR REPLACE VIEW v_public_award_result_source AS
SELECT ars.*
FROM award_result_source ars
JOIN v_public_award_result ar ON ar.award_result_id = ars.award_result_id;

CREATE OR REPLACE VIEW v_public_case_source AS
SELECT cs.*
FROM case_source cs
JOIN v_public_case_project c ON c.case_id = cs.case_id;

-- 其余三张关联表的父实体是一级对象，公开集合 = 父实体 published
CREATE OR REPLACE VIEW v_public_country_source AS
SELECT cs.* FROM country_source cs JOIN country c ON c.country_id = cs.country_id
WHERE c.status = 'published';

CREATE OR REPLACE VIEW v_public_library_source AS
SELECT ls.* FROM library_source ls JOIN library l ON l.library_id = ls.library_id
WHERE l.status = 'published';

CREATE OR REPLACE VIEW v_public_award_source AS
SELECT aws.* FROM award_source aws JOIN award a ON a.award_id = aws.award_id
WHERE a.status = 'published';

COMMENT ON VIEW v_public_award_result IS
    'B3.4：Award Result 只有在自身 published 且 Award 与 Library 均 published 时才可公开。';
COMMENT ON VIEW v_public_case_project IS
    'B3.4：Case 只有在自身 published 且其 Library published 时才可公开。';
COMMENT ON VIEW v_public_award_result_source IS
    'B3.4：Award Result 的 Source 关系随父实体状态收敛（两级父链：Award Result → Award / Library）。';
COMMENT ON VIEW v_public_case_source IS
    'B3.4：Case 的 Source 关系随父实体状态收敛（Case → Library）。';
