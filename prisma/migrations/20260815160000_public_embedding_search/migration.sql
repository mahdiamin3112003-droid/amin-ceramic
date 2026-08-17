-- Let the public Tile Finder search embeddings, without exposing them.
--
-- ── The failure, and why it was the worst kind ──
-- `product_embedding` is readable only by staff holding `ai.configure`.
-- A visitor's kNN query therefore matched zero rows and the API answered
-- "no matches" — with no error anywhere.
--
-- That is indistinguishable from the feature working correctly and honestly
-- declining to guess. The negative test in this session would have PASSED
-- for entirely the wrong reason, and the Tile Finder would have shipped
-- returning nothing to everyone. The RLS problems found earlier in the same
-- session at least threw.
--
-- ── Why a function and not a public SELECT policy ──
-- A policy would work and would be wrong. Retrieval needs to COMPARE
-- vectors, not read them, but RLS grants access to rows — so a permissive
-- policy would let anyone page through `product_embedding` and copy every
-- vector in the catalogue. Those vectors are the derived asset the AI
-- features are built on.
--
-- A SECURITY DEFINER function returns only `(product_id, distance)`. The
-- table stays unreadable, and the only thing the public can learn is what
-- the feature already tells them. Same pattern as `app.consume_rate_limit`.

CREATE OR REPLACE FUNCTION app.search_product_embeddings(
    p_tenant_id  UUID,
    p_query      extensions.halfvec,
    p_kind       TEXT,
    p_limit      INT,
    p_is_indoor  BOOLEAN DEFAULT NULL,
    p_is_outdoor BOOLEAN DEFAULT NULL,
    p_finish_key TEXT    DEFAULT NULL
) RETURNS TABLE (product_id UUID, distance DOUBLE PRECISION)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
-- Empty search_path per ADR-0011; every reference below is schema-qualified.
SET search_path = ''
AS $$
BEGIN
    IF p_kind NOT IN ('visual', 'semantic') THEN
        RAISE EXCEPTION 'unknown embedding kind: %', p_kind;
    END IF;

    -- Two branches rather than dynamic SQL on a column name: the column is
    -- chosen from a checked enum of two values, and building the query as a
    -- string would put an injection surface on a PUBLIC endpoint to save a
    -- few lines.
    IF p_kind = 'visual' THEN
        RETURN QUERY
        SELECT pe.product_id,
               (pe.visual_embedding OPERATOR(extensions.<=>) p_query)::double precision
        FROM public.product_embedding pe
        JOIN public.product p ON p.id = pe.product_id
        JOIN public.finish f ON f.id = p.finish_id
        WHERE pe.tenant_id = p_tenant_id
          AND pe.is_current
          AND pe.visual_embedding IS NOT NULL
          AND p.status = 'published'
          AND p.deleted_at IS NULL
          AND (p_is_indoor  IS NULL OR p.is_indoor  = p_is_indoor)
          AND (p_is_outdoor IS NULL OR p.is_outdoor = p_is_outdoor)
          AND (p_finish_key IS NULL OR f.key = p_finish_key)
        ORDER BY pe.visual_embedding OPERATOR(extensions.<=>) p_query
        LIMIT p_limit;
    ELSE
        RETURN QUERY
        SELECT pe.product_id,
               (pe.semantic_embedding OPERATOR(extensions.<=>) p_query)::double precision
        FROM public.product_embedding pe
        JOIN public.product p ON p.id = pe.product_id
        JOIN public.finish f ON f.id = p.finish_id
        WHERE pe.tenant_id = p_tenant_id
          AND pe.is_current
          AND pe.semantic_embedding IS NOT NULL
          AND p.status = 'published'
          AND p.deleted_at IS NULL
          AND (p_is_indoor  IS NULL OR p.is_indoor  = p_is_indoor)
          AND (p_is_outdoor IS NULL OR p.is_outdoor = p_is_outdoor)
          AND (p_finish_key IS NULL OR f.key = p_finish_key)
        ORDER BY pe.semantic_embedding OPERATOR(extensions.<=>) p_query
        LIMIT p_limit;
    END IF;
END;
$$;

REVOKE ALL ON FUNCTION app.search_product_embeddings(UUID, extensions.halfvec, TEXT, INT, BOOLEAN, BOOLEAN, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.search_product_embeddings(UUID, extensions.halfvec, TEXT, INT, BOOLEAN, BOOLEAN, TEXT) FROM anon;
REVOKE ALL ON FUNCTION app.search_product_embeddings(UUID, extensions.halfvec, TEXT, INT, BOOLEAN, BOOLEAN, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION app.search_product_embeddings(UUID, extensions.halfvec, TEXT, INT, BOOLEAN, BOOLEAN, TEXT) TO app_runtime;
