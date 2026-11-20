-- Baseline: production schema as of 2026-11-20 (pg_dump --schema-only of prod,
-- which already had every scripts/migrate-*.mjs applied). Existing databases
-- record this as applied with `node scripts/migrate.mjs --mark-applied 0000_baseline.sql`;
-- a fresh database gets the whole schema from it.
--
-- PostgreSQL database dump
--


-- Dumped from database version 17.12 (4d8000a)
-- Dumped by pg_dump version 17.12 (Homebrew)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: acc_check_voucher_balance(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.acc_check_voucher_balance() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
      DECLARE v_id BIGINT := COALESCE(NEW.voucher_id, OLD.voucher_id); total NUMERIC;
      BEGIN
        SELECT COALESCE(SUM(amount), 0) INTO total FROM acc_voucher_lines WHERE voucher_id = v_id;
        IF total <> 0 AND EXISTS (SELECT 1 FROM acc_vouchers WHERE id = v_id) THEN
          RAISE EXCEPTION 'Voucher % does not balance (difference %)', v_id, total;
        END IF;
        RETURN NULL;
      END $$;


--
-- Name: acc_guard_voucher(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.acc_guard_voucher() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
      DECLARE fy_locked BOOLEAN;
      BEGIN
        SELECT locked_at IS NOT NULL INTO fy_locked FROM acc_fiscal_years
         WHERE business_id = COALESCE(NEW.business_id, OLD.business_id)
           AND fiscal_year = COALESCE(NEW.fiscal_year, OLD.fiscal_year);
        IF fy_locked THEN
          RAISE EXCEPTION 'Financial year % is locked', COALESCE(NEW.fiscal_year, OLD.fiscal_year);
        END IF;
        IF TG_OP = 'DELETE' THEN
          IF OLD.status <> 'draft' THEN RAISE EXCEPTION 'A % voucher cannot be deleted; cancel it instead', OLD.status; END IF;
          RETURN OLD;
        END IF;
        IF TG_OP = 'UPDATE' AND OLD.status = 'cancelled' AND (NEW.status <> 'cancelled' OR NEW.exported_at IS NOT DISTINCT FROM OLD.exported_at) THEN
          RAISE EXCEPTION 'A cancelled voucher cannot change';
        END IF;
        IF TG_OP = 'UPDATE' AND OLD.status = 'posted' AND (
             NEW.status NOT IN ('posted', 'cancelled')
             OR NEW.voucher_date IS DISTINCT FROM OLD.voucher_date
             OR NEW.voucher_number IS DISTINCT FROM OLD.voucher_number
             OR NEW.amount IS DISTINCT FROM OLD.amount
             OR NEW.party_ledger_id IS DISTINCT FROM OLD.party_ledger_id
             OR NEW.business_id IS DISTINCT FROM OLD.business_id) THEN
          RAISE EXCEPTION 'A posted voucher cannot be edited; cancel it and post a new one';
        END IF;
        RETURN NEW;
      END $$;


--
-- Name: acc_guard_voucher_line(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.acc_guard_voucher_line() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
      DECLARE v_status TEXT;
      BEGIN
        SELECT status INTO v_status FROM acc_vouchers WHERE id = COALESCE(NEW.voucher_id, OLD.voucher_id);
        IF v_status IS NULL OR v_status = 'draft' THEN
          RETURN COALESCE(NEW, OLD);
        END IF;
        IF TG_OP = 'UPDATE'
           AND NEW.ledger_id = OLD.ledger_id AND NEW.amount = OLD.amount
           AND NEW.bill_ref IS NOT DISTINCT FROM OLD.bill_ref
           AND NEW.bill_ref_type IS NOT DISTINCT FROM OLD.bill_ref_type THEN
          RETURN NEW; -- bank reconciliation marks cleared dates on posted lines
        END IF;
        RAISE EXCEPTION 'Lines of a % voucher cannot change', v_status;
      END $$;


--
-- Name: audit_row_change(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.audit_row_change() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
      BEGIN
        -- Logging must never block the write it records: any failure here is
        -- downgraded to a warning instead of aborting the business change.
        BEGIN
          INSERT INTO stock_audit_logs (action, entity_type, entity_id, user_id, user_email, timestamp, changes, details)
          VALUES (
            lower(TG_OP), TG_TABLE_NAME,
            CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END,
            COALESCE(NULLIF(current_setting('app.user_id', true), ''), 'system'),
            COALESCE(NULLIF(current_setting('app.user_email', true), ''), 'system'),
            NOW(),
            jsonb_build_object('old', CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD) END,
                               'new', CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) END),
            'db-trigger'
          );
        EXCEPTION WHEN OTHERS THEN
          RAISE WARNING 'audit_row_change failed for %: %', TG_TABLE_NAME, SQLERRM;
        END;
        RETURN NULL;
      END $$;


--
-- Name: forbid_deprecated_table_writes(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.forbid_deprecated_table_writes() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  RAISE EXCEPTION 'Writes are blocked: deprecated table %', TG_TABLE_NAME;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: acc_fiscal_years; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.acc_fiscal_years (
    business_id bigint NOT NULL,
    fiscal_year text NOT NULL,
    locked_at timestamp without time zone,
    locked_by_user_id bigint
);


--
-- Name: acc_ledgers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.acc_ledgers (
    id bigint NOT NULL,
    business_id bigint NOT NULL,
    name text NOT NULL,
    group_name text NOT NULL,
    system_key text,
    customer_id bigint,
    supplier_id bigint,
    transporter_id bigint,
    app_user_id bigint,
    gstin text,
    state_code text,
    phone text,
    credit_limit numeric(14,2) DEFAULT 0 NOT NULL,
    credit_days integer DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: acc_ledgers_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.acc_ledgers_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: acc_ledgers_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.acc_ledgers_id_seq OWNED BY public.acc_ledgers.id;


--
-- Name: acc_voucher_lines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.acc_voucher_lines (
    id bigint NOT NULL,
    voucher_id bigint NOT NULL,
    ledger_id bigint NOT NULL,
    amount numeric(14,2) NOT NULL,
    bill_ref_type text,
    bill_ref text,
    bill_date date,
    location_id bigint,
    bank_cleared_on date,
    instrument_no text,
    sort integer DEFAULT 0 NOT NULL,
    CONSTRAINT acc_voucher_lines_amount_check CHECK ((amount <> (0)::numeric)),
    CONSTRAINT acc_voucher_lines_bill_ref_type_check CHECK ((bill_ref_type = ANY (ARRAY['new'::text, 'against'::text, 'on_account'::text])))
);


--
-- Name: acc_voucher_lines_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.acc_voucher_lines_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: acc_voucher_lines_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.acc_voucher_lines_id_seq OWNED BY public.acc_voucher_lines.id;


--
-- Name: acc_vouchers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.acc_vouchers (
    id bigint NOT NULL,
    business_id bigint NOT NULL,
    voucher_type text NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    voucher_date date NOT NULL,
    fiscal_year text NOT NULL,
    seq integer,
    voucher_number text,
    reference text,
    narration text,
    party_ledger_id bigint,
    amount numeric(14,2) DEFAULT 0 NOT NULL,
    source_table text,
    source_id bigint,
    created_by_user_id bigint,
    approved_by_user_id bigint,
    posted_at timestamp without time zone,
    cancelled_at timestamp without time zone,
    cancelled_by_user_id bigint,
    exported_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    CONSTRAINT acc_vouchers_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'posted'::text, 'cancelled'::text]))),
    CONSTRAINT acc_vouchers_voucher_type_check CHECK ((voucher_type = ANY (ARRAY['sales'::text, 'purchase'::text, 'receipt'::text, 'payment'::text, 'contra'::text, 'journal'::text, 'opening'::text, 'credit_note'::text, 'debit_note'::text, 'payroll'::text])))
);


--
-- Name: acc_vouchers_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.acc_vouchers_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: acc_vouchers_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.acc_vouchers_id_seq OWNED BY public.acc_vouchers.id;


--
-- Name: account; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.account (
    id text NOT NULL,
    "accountId" text NOT NULL,
    "providerId" text NOT NULL,
    "userId" text NOT NULL,
    "accessToken" text,
    "refreshToken" text,
    "idToken" text,
    "accessTokenExpiresAt" timestamp with time zone,
    "refreshTokenExpiresAt" timestamp with time zone,
    scope text,
    password text,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL
);


--
-- Name: session; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.session (
    id text NOT NULL,
    "expiresAt" timestamp with time zone NOT NULL,
    token text NOT NULL,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL,
    "ipAddress" text,
    "userAgent" text,
    "userId" text NOT NULL,
    "impersonatedBy" text
);


--
-- Name: stock_app_users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stock_app_users (
    id bigint NOT NULL,
    auth0_sub text,
    name text NOT NULL,
    phone text NOT NULL,
    email text,
    role text DEFAULT 'user'::text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    can_manage_users boolean DEFAULT false NOT NULL,
    can_approve_changes boolean DEFAULT false NOT NULL,
    can_view_dashboard boolean DEFAULT true NOT NULL,
    last_login_at timestamp without time zone,
    created_by text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    department text,
    division_id bigint,
    salary numeric(12,2) DEFAULT NULL::numeric,
    monthly_sales_goal numeric(12,2) DEFAULT NULL::numeric,
    attendance_pin_hash text,
    tracks_attendance boolean DEFAULT true NOT NULL,
    has_login boolean DEFAULT true NOT NULL,
    default_location_id bigint,
    can_sell boolean DEFAULT false NOT NULL,
    CONSTRAINT stock_app_users_role_check CHECK ((role = ANY (ARRAY['admin'::text, 'manager'::text, 'stock_maintainer'::text, 'salesperson'::text, 'read_only_admin'::text]))),
    CONSTRAINT stock_app_users_status_check CHECK ((status = ANY (ARRAY['active'::text, 'inactive'::text, 'suspended'::text])))
);


--
-- Name: stock_app_users_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.stock_app_users_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: stock_app_users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.stock_app_users_id_seq OWNED BY public.stock_app_users.id;


--
-- Name: stock_attendance_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stock_attendance_entries (
    id bigint NOT NULL,
    user_id bigint NOT NULL,
    work_date date NOT NULL,
    clock_in_at timestamp without time zone NOT NULL,
    clock_out_at timestamp without time zone,
    break_seconds integer DEFAULT 0 NOT NULL,
    break_started_at timestamp without time zone,
    source text DEFAULT 'web'::text NOT NULL,
    location_id bigint,
    in_lat numeric(9,6),
    in_lng numeric(9,6),
    out_lat numeric(9,6),
    out_lng numeric(9,6),
    is_outside_geofence boolean DEFAULT false NOT NULL,
    note text,
    edited_by bigint,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    in_selfie_key text,
    out_selfie_key text,
    CONSTRAINT stock_attendance_entries_break_valid CHECK ((break_seconds >= 0)),
    CONSTRAINT stock_attendance_entries_source_check CHECK ((source = ANY (ARRAY['web'::text, 'kiosk'::text, 'manual'::text]))),
    CONSTRAINT stock_attendance_entries_span_valid CHECK (((clock_out_at IS NULL) OR (clock_out_at > clock_in_at)))
);


--
-- Name: stock_attendance_entries_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.stock_attendance_entries_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: stock_attendance_entries_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.stock_attendance_entries_id_seq OWNED BY public.stock_attendance_entries.id;


--
-- Name: stock_attendance_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stock_attendance_settings (
    id integer DEFAULT 1 NOT NULL,
    shift_start time without time zone DEFAULT '09:30:00'::time without time zone NOT NULL,
    shift_end time without time zone DEFAULT '19:00:00'::time without time zone NOT NULL,
    full_day_minutes integer DEFAULT 480 NOT NULL,
    half_day_minutes integer DEFAULT 240 NOT NULL,
    grace_minutes integer DEFAULT 15 NOT NULL,
    weekly_off_dow integer DEFAULT 0 NOT NULL,
    overtime_multiplier numeric(4,2) DEFAULT 1.5 NOT NULL,
    geofence_radius_m integer DEFAULT 200 NOT NULL,
    updated_by bigint,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    require_selfie boolean DEFAULT false NOT NULL,
    CONSTRAINT stock_attendance_settings_id_check CHECK ((id = 1)),
    CONSTRAINT stock_attendance_settings_weekly_off_dow_check CHECK (((weekly_off_dow >= 0) AND (weekly_off_dow <= 6)))
);


--
-- Name: stock_audit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stock_audit_logs (
    id bigint NOT NULL,
    action text NOT NULL,
    entity_type text NOT NULL,
    entity_id bigint,
    user_id text NOT NULL,
    user_email text NOT NULL,
    "timestamp" timestamp without time zone DEFAULT now() NOT NULL,
    changes jsonb,
    details text,
    ip_address text,
    user_agent text
);


--
-- Name: stock_audit_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.stock_audit_logs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: stock_audit_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.stock_audit_logs_id_seq OWNED BY public.stock_audit_logs.id;


--
-- Name: stock_inventory_lots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stock_inventory_lots (
    id bigint NOT NULL,
    lot_number text NOT NULL,
    item_id bigint NOT NULL,
    location_id bigint,
    source_type text NOT NULL,
    source_table text,
    source_id bigint,
    tile_condition text DEFAULT 'whole'::text NOT NULL,
    quantity_received integer DEFAULT 0 NOT NULL,
    quantity_available integer DEFAULT 0 NOT NULL,
    quantity_reserved integer DEFAULT 0 NOT NULL,
    unit_cost numeric(12,2) DEFAULT 0 NOT NULL,
    landed_cost numeric(12,2) DEFAULT 0 NOT NULL,
    received_at timestamp without time zone DEFAULT now() NOT NULL,
    expiry_date date,
    qc_status text DEFAULT 'pending'::text NOT NULL,
    notes text,
    created_by text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    quantity_sqft numeric(14,3) DEFAULT 0 NOT NULL,
    CONSTRAINT stock_inventory_lots_qc_status_check CHECK ((qc_status = ANY (ARRAY['pending'::text, 'passed'::text, 'failed'::text, 'mixed'::text]))),
    CONSTRAINT stock_inventory_lots_qty_nonnegative CHECK (((quantity_received >= 0) AND (quantity_available >= 0) AND (quantity_reserved >= 0))),
    CONSTRAINT stock_inventory_lots_source_type_check CHECK ((source_type = ANY (ARRAY['purchase'::text, 'return'::text, 'adjustment'::text, 'transfer'::text, 'opening_balance'::text]))),
    CONSTRAINT stock_inventory_lots_tile_condition_check CHECK ((tile_condition = ANY (ARRAY['whole'::text, 'broken'::text])))
);


--
-- Name: stock_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stock_items (
    id bigint NOT NULL,
    sku text NOT NULL,
    brand_id bigint,
    type_id bigint,
    size_id bigint,
    name text NOT NULL,
    name_hi text,
    finish text,
    color text,
    material text,
    grade text,
    series text,
    unit_of_measure text DEFAULT 'box'::text NOT NULL,
    tiles_per_box integer,
    pieces_per_box integer,
    thickness_mm numeric(10,2),
    weight_kg numeric(12,3),
    reorder_level integer DEFAULT 10 NOT NULL,
    safety_stock integer DEFAULT 0 NOT NULL,
    current_whole_qty integer DEFAULT 0 NOT NULL,
    current_broken_qty integer DEFAULT 0 NOT NULL,
    reserved_whole_qty integer DEFAULT 0 NOT NULL,
    reserved_broken_qty integer DEFAULT 0 NOT NULL,
    purchase_price numeric(12,2),
    landed_cost numeric(12,2),
    selling_price numeric(12,2),
    description text,
    description_hi text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    division_id bigint,
    department text,
    weight_per_unit_kg numeric(12,3),
    rate_per_bag numeric(12,2),
    current_piece_remainder integer DEFAULT 0 NOT NULL,
    current_broken_piece_remainder integer DEFAULT 0 NOT NULL,
    current_sqft numeric(14,3) DEFAULT 0 NOT NULL,
    rate_per_sqft numeric(12,2),
    showroom_whole_qty integer DEFAULT 0 NOT NULL,
    showroom_sqft numeric(14,3) DEFAULT 0 NOT NULL,
    showroom_installed_whole_qty integer DEFAULT 0 NOT NULL,
    showroom_installed_sqft numeric(14,3) DEFAULT 0 NOT NULL,
    CONSTRAINT stock_items_broken_piece_remainder_nonneg CHECK ((current_broken_piece_remainder >= 0)),
    CONSTRAINT stock_items_piece_remainder_nonneg CHECK ((current_piece_remainder >= 0)),
    CONSTRAINT stock_items_qty_nonnegative CHECK (((current_whole_qty >= 0) AND (current_broken_qty >= 0) AND (reserved_whole_qty >= 0) AND (reserved_broken_qty >= 0))),
    CONSTRAINT stock_items_showroom_installed_valid CHECK (((showroom_installed_whole_qty >= 0) AND (showroom_installed_sqft >= (0)::numeric) AND (showroom_installed_whole_qty <= showroom_whole_qty) AND (showroom_installed_sqft <= showroom_sqft))),
    CONSTRAINT stock_items_showroom_nonnegative CHECK (((showroom_whole_qty >= 0) AND (showroom_sqft >= (0)::numeric))),
    CONSTRAINT stock_items_sqft_nonnegative CHECK ((current_sqft >= (0)::numeric))
);


--
-- Name: stock_balance_drift_v; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.stock_balance_drift_v AS
 WITH lot_totals AS (
         SELECT stock_inventory_lots.item_id,
            sum(
                CASE
                    WHEN (stock_inventory_lots.tile_condition = 'whole'::text) THEN stock_inventory_lots.quantity_available
                    ELSE 0
                END) AS lot_whole,
            sum(
                CASE
                    WHEN (stock_inventory_lots.tile_condition = 'broken'::text) THEN stock_inventory_lots.quantity_available
                    ELSE 0
                END) AS lot_broken
           FROM public.stock_inventory_lots
          GROUP BY stock_inventory_lots.item_id
        )
 SELECT si.id AS item_id,
    si.sku,
    si.name,
    si.current_whole_qty,
    COALESCE(lt.lot_whole, (0)::bigint) AS lot_whole_qty,
    (si.current_whole_qty - COALESCE(lt.lot_whole, (0)::bigint)) AS whole_diff,
    si.current_broken_qty,
    COALESCE(lt.lot_broken, (0)::bigint) AS lot_broken_qty,
    (si.current_broken_qty - COALESCE(lt.lot_broken, (0)::bigint)) AS broken_diff
   FROM (public.stock_items si
     LEFT JOIN lot_totals lt ON ((lt.item_id = si.id)));


--
-- Name: stock_brands; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stock_brands (
    id bigint NOT NULL,
    name text NOT NULL,
    name_hi text,
    description text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: stock_brands_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.stock_brands_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: stock_brands_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.stock_brands_id_seq OWNED BY public.stock_brands.id;


--
-- Name: stock_businesses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stock_businesses (
    id bigint NOT NULL,
    legal_name text NOT NULL,
    trade_name text,
    gstin text NOT NULL,
    state_code text NOT NULL,
    address text,
    phone text,
    email text,
    bank_name text,
    bank_account text,
    bank_ifsc text,
    invoice_prefix text DEFAULT 'HM'::text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    city text,
    pincode text,
    upi_id text,
    einvoice_enabled boolean DEFAULT true NOT NULL,
    ewb_threshold numeric(14,2) DEFAULT 50000 NOT NULL,
    books_start_date date
);


--
-- Name: stock_businesses_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.stock_businesses_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: stock_businesses_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.stock_businesses_id_seq OWNED BY public.stock_businesses.id;


--
-- Name: stock_change_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stock_change_requests (
    id bigint NOT NULL,
    request_number text NOT NULL,
    source_entity_type text NOT NULL,
    source_entity_id bigint NOT NULL,
    request_type text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    requested_changes jsonb DEFAULT '{}'::jsonb NOT NULL,
    original_snapshot jsonb,
    reason text NOT NULL,
    requested_by_user_id bigint,
    requested_by_name text,
    reviewed_by_user_id bigint,
    reviewed_at timestamp without time zone,
    reviewed_notes text,
    approved_by_user_id bigint,
    approved_at timestamp without time zone,
    approval_notes text,
    implemented_at timestamp without time zone,
    implemented_by_user_id bigint,
    priority text DEFAULT 'normal'::text NOT NULL,
    requires_higher_level_approval boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    CONSTRAINT stock_change_requests_priority_check CHECK ((priority = ANY (ARRAY['low'::text, 'normal'::text, 'high'::text, 'urgent'::text]))),
    CONSTRAINT stock_change_requests_request_type_check CHECK ((request_type = ANY (ARRAY['create'::text, 'update'::text, 'delete'::text, 'correct'::text, 'approve'::text, 'reject'::text, 'reopen'::text, 'adjust'::text]))),
    CONSTRAINT stock_change_requests_source_entity_type_check CHECK ((source_entity_type = ANY (ARRAY['inbound_shipment'::text, 'outbound_shipment'::text, 'purchase_order'::text, 'sales_order'::text, 'stock_item'::text, 'stock_document'::text, 'other'::text]))),
    CONSTRAINT stock_change_requests_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'reviewed'::text, 'approved'::text, 'rejected'::text, 'cancelled'::text, 'implemented'::text])))
);


--
-- Name: stock_change_requests_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.stock_change_requests_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: stock_change_requests_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.stock_change_requests_id_seq OWNED BY public.stock_change_requests.id;


--
-- Name: stock_customer_acknowledgements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stock_customer_acknowledgements (
    id bigint NOT NULL,
    outbound_shipment_id bigint NOT NULL,
    customer_id bigint,
    acknowledged_by text,
    acknowledged_phone text,
    acknowledgement_status text DEFAULT 'pending'::text NOT NULL,
    acknowledged_at timestamp without time zone,
    signature_url text,
    photo_url text,
    notes text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    CONSTRAINT stock_customer_acknowledgements_acknowledgement_status_check CHECK ((acknowledgement_status = ANY (ARRAY['pending'::text, 'received'::text, 'partial'::text, 'damaged'::text, 'rejected'::text])))
);


--
-- Name: stock_customer_acknowledgements_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.stock_customer_acknowledgements_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: stock_customer_acknowledgements_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.stock_customer_acknowledgements_id_seq OWNED BY public.stock_customer_acknowledgements.id;


--
-- Name: stock_customers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stock_customers (
    id bigint NOT NULL,
    name text NOT NULL,
    company_name text,
    phone text,
    whatsapp_phone text,
    email text,
    billing_address text,
    shipping_address text,
    gst_number text,
    notes text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: stock_customers_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.stock_customers_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: stock_customers_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.stock_customers_id_seq OWNED BY public.stock_customers.id;


--
-- Name: stock_inbound_shipments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stock_inbound_shipments (
    id bigint NOT NULL,
    shipment_number text NOT NULL,
    purchase_order_id bigint,
    supplier_id bigint,
    transporter_id bigint,
    vehicle_id bigint,
    truck_license_plate_snapshot text,
    truck_number_snapshot text,
    driver_name_snapshot text,
    driver_phone_snapshot text,
    arrival_date timestamp without time zone DEFAULT now() NOT NULL,
    received_date timestamp without time zone,
    submitted_at timestamp without time zone,
    submitted_by_user_id bigint,
    reviewed_at timestamp without time zone,
    reviewed_by_user_id bigint,
    approval_status text DEFAULT 'pending'::text NOT NULL,
    approval_notes text,
    approved_at timestamp without time zone,
    approved_by_user_id bigint,
    locked_at timestamp without time zone,
    locked_by_user_id bigint,
    invoice_number text,
    invoice_document_id bigint,
    transporter_bill_number text,
    transporter_bill_document_id bigint,
    transporter_bill_amount numeric(14,2) DEFAULT 0 NOT NULL,
    delivery_cost numeric(14,2) DEFAULT 0 NOT NULL,
    unloading_labour_cost numeric(14,2) DEFAULT 0 NOT NULL,
    total_whole_qty integer DEFAULT 0 NOT NULL,
    total_broken_qty integer DEFAULT 0 NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    whatsapp_notified_at timestamp without time zone,
    received_by text,
    recorded_by_user_id bigint,
    notes text,
    created_by text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    invoice_date date,
    origin_city text,
    payment_status text DEFAULT 'unpaid'::text NOT NULL,
    paid_amount numeric(14,2),
    payment_date date,
    payment_reference text,
    payment_mode text,
    customer_id bigint,
    salesperson_id bigint,
    destination_location_id bigint,
    handling_cost_percent numeric(5,2) DEFAULT 1.0 NOT NULL,
    fuel_cost_percent numeric(5,2) DEFAULT 5.0 NOT NULL,
    gst_percent numeric(5,2) DEFAULT 18.0 NOT NULL,
    grand_total numeric(14,2) DEFAULT 0 NOT NULL,
    freight_weight_kg numeric(12,3),
    destination_warehouse_name text,
    discount_amount numeric(14,2) DEFAULT 0 NOT NULL,
    trip_id bigint,
    CONSTRAINT stock_inbound_shipments_approval_status_check CHECK ((approval_status = ANY (ARRAY['pending'::text, 'reviewed'::text, 'approved'::text, 'rejected'::text, 'changes_requested'::text]))),
    CONSTRAINT stock_inbound_shipments_payment_status_check CHECK ((payment_status = ANY (ARRAY['unpaid'::text, 'partial'::text, 'paid'::text]))),
    CONSTRAINT stock_inbound_shipments_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'submitted'::text, 'arrived'::text, 'partially_received'::text, 'received'::text, 'closed'::text, 'cancelled'::text])))
);


--
-- Name: COLUMN stock_inbound_shipments.truck_license_plate_snapshot; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.stock_inbound_shipments.truck_license_plate_snapshot IS 'DEPRECATED_2026-04-19: use vehicle_id FK → stock_vehicles.vehicle_number (will be renamed to truck_license_plate_snapshot)';


--
-- Name: COLUMN stock_inbound_shipments.truck_number_snapshot; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.stock_inbound_shipments.truck_number_snapshot IS 'DEPRECATED_2026-04-19: use vehicle_id FK → stock_vehicles.vehicle_number (will be renamed to truck_number_snapshot)';


--
-- Name: COLUMN stock_inbound_shipments.driver_name_snapshot; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.stock_inbound_shipments.driver_name_snapshot IS 'DEPRECATED_2026-04-19: use vehicle_id FK → stock_vehicles.driver_name (will be renamed to driver_name_snapshot)';


--
-- Name: COLUMN stock_inbound_shipments.driver_phone_snapshot; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.stock_inbound_shipments.driver_phone_snapshot IS 'DEPRECATED_2026-04-19: use vehicle_id FK → stock_vehicles.driver_phone (will be renamed to driver_phone_snapshot)';


--
-- Name: stock_movements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stock_movements (
    id bigint NOT NULL,
    movement_number text NOT NULL,
    movement_type text NOT NULL,
    direction text NOT NULL,
    item_id bigint NOT NULL,
    location_id bigint,
    inventory_lot_id bigint,
    quantity integer NOT NULL,
    tile_condition text DEFAULT 'whole'::text NOT NULL,
    unit_cost numeric(12,2),
    labour_cost numeric(12,2) DEFAULT 0 NOT NULL,
    transport_cost numeric(12,2) DEFAULT 0 NOT NULL,
    source_type text,
    source_id bigint,
    reference_number text,
    notes text,
    created_by text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    quantity_sqft numeric(14,3) DEFAULT 0 NOT NULL,
    CONSTRAINT stock_movements_direction_check CHECK ((direction = ANY (ARRAY['in'::text, 'out'::text]))),
    CONSTRAINT stock_movements_movement_type_check CHECK ((movement_type = ANY (ARRAY['purchase_receive'::text, 'sale_issue'::text, 'return_in'::text, 'return_out'::text, 'damage_writeoff'::text, 'adjustment_plus'::text, 'adjustment_minus'::text, 'transfer_in'::text, 'transfer_out'::text]))),
    CONSTRAINT stock_movements_tile_condition_check CHECK ((tile_condition = ANY (ARRAY['whole'::text, 'broken'::text])))
);


--
-- Name: stock_outbound_shipments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stock_outbound_shipments (
    id bigint NOT NULL,
    shipment_number text NOT NULL,
    sales_order_id bigint,
    vehicle_id bigint,
    truck_license_plate_snapshot text,
    driver_name_snapshot text,
    driver_phone_snapshot text,
    truck_number_snapshot text,
    gatepass_number text,
    gatepass_document_id bigint,
    invoice_number text,
    invoice_document_id bigint,
    submitted_at timestamp without time zone,
    submitted_by_user_id bigint,
    reviewed_at timestamp without time zone,
    reviewed_by_user_id bigint,
    approval_status text DEFAULT 'pending'::text NOT NULL,
    approval_notes text,
    approved_at timestamp without time zone,
    approved_by_user_id bigint,
    dispatch_date timestamp without time zone DEFAULT now() NOT NULL,
    delivered_date timestamp without time zone,
    customer_acknowledged_at timestamp without time zone,
    customer_acknowledged_by text,
    customer_acknowledgement_id bigint,
    status text DEFAULT 'draft'::text NOT NULL,
    loading_labour_cost numeric(14,2) DEFAULT 0 NOT NULL,
    transport_cost numeric(14,2) DEFAULT 0 NOT NULL,
    return_broken_qty integer DEFAULT 0 NOT NULL,
    return_notes text,
    recorded_by_user_id bigint,
    notes text,
    created_by text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    customer_id bigint,
    salesperson_id bigint,
    payment_status text DEFAULT 'unpaid'::text NOT NULL,
    salesperson_user_id bigint,
    locked_at timestamp without time zone,
    locked_by_user_id bigint,
    sales_invoice_id bigint,
    ewb_no text,
    ewb_date timestamp without time zone,
    CONSTRAINT stock_outbound_shipments_approval_status_check CHECK ((approval_status = ANY (ARRAY['pending'::text, 'reviewed'::text, 'approved'::text, 'rejected'::text, 'changes_requested'::text]))),
    CONSTRAINT stock_outbound_shipments_payment_status_check CHECK ((payment_status = ANY (ARRAY['unpaid'::text, 'partial'::text, 'paid'::text]))),
    CONSTRAINT stock_outbound_shipments_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'submitted'::text, 'packed'::text, 'dispatched'::text, 'delivered'::text, 'partially_returned'::text, 'returned'::text, 'closed'::text, 'cancelled'::text])))
);


--
-- Name: COLUMN stock_outbound_shipments.truck_license_plate_snapshot; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.stock_outbound_shipments.truck_license_plate_snapshot IS 'DEPRECATED_2026-04-19: use vehicle_id FK → stock_vehicles.vehicle_number (will be renamed to truck_license_plate_snapshot)';


--
-- Name: COLUMN stock_outbound_shipments.driver_name_snapshot; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.stock_outbound_shipments.driver_name_snapshot IS 'DEPRECATED_2026-04-19: use vehicle_id FK → stock_vehicles.driver_name (will be renamed to driver_name_snapshot)';


--
-- Name: COLUMN stock_outbound_shipments.driver_phone_snapshot; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.stock_outbound_shipments.driver_phone_snapshot IS 'DEPRECATED_2026-04-19: use vehicle_id FK → stock_vehicles.driver_phone (will be renamed to driver_phone_snapshot)';


--
-- Name: COLUMN stock_outbound_shipments.truck_number_snapshot; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.stock_outbound_shipments.truck_number_snapshot IS 'DEPRECATED_2026-04-19: use vehicle_id FK → stock_vehicles.vehicle_number (will be renamed to truck_number_snapshot)';


--
-- Name: stock_dashboard_summary_view; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.stock_dashboard_summary_view AS
 SELECT ( SELECT count(*) AS count
           FROM public.stock_items
          WHERE (stock_items.is_active = true)) AS total_items,
    ( SELECT COALESCE(sum(stock_items.current_whole_qty), (0)::bigint) AS "coalesce"
           FROM public.stock_items
          WHERE (stock_items.is_active = true)) AS total_whole_stored,
    ( SELECT COALESCE(sum(stock_items.current_broken_qty), (0)::bigint) AS "coalesce"
           FROM public.stock_items
          WHERE (stock_items.is_active = true)) AS total_broken_stored,
    ( SELECT COALESCE(sum(stock_movements.quantity), (0)::bigint) AS "coalesce"
           FROM public.stock_movements
          WHERE (stock_movements.direction = 'in'::text)) AS total_incoming,
    ( SELECT COALESCE(sum(stock_movements.quantity), (0)::bigint) AS "coalesce"
           FROM public.stock_movements
          WHERE (stock_movements.direction = 'out'::text)) AS total_outgoing,
    ( SELECT COALESCE(sum(stock_movements.labour_cost), (0)::numeric) AS "coalesce"
           FROM public.stock_movements) AS total_labour_cost,
    ( SELECT COALESCE(sum(stock_movements.transport_cost), (0)::numeric) AS "coalesce"
           FROM public.stock_movements) AS total_transport_cost,
    ( SELECT count(*) AS count
           FROM public.stock_change_requests
          WHERE (stock_change_requests.status = 'pending'::text)) AS pending_change_requests,
    ( SELECT count(*) AS count
           FROM public.stock_inbound_shipments
          WHERE (stock_inbound_shipments.approval_status = 'pending'::text)) AS pending_inbound_reviews,
    ( SELECT count(*) AS count
           FROM public.stock_outbound_shipments
          WHERE (stock_outbound_shipments.approval_status = 'pending'::text)) AS pending_outbound_reviews;


--
-- Name: stock_divisions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stock_divisions (
    id bigint NOT NULL,
    name text NOT NULL,
    description text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: stock_divisions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.stock_divisions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: stock_divisions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.stock_divisions_id_seq OWNED BY public.stock_divisions.id;


--
-- Name: stock_documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stock_documents (
    id bigint NOT NULL,
    document_number text,
    document_type text NOT NULL,
    entity_type text NOT NULL,
    entity_id bigint,
    file_name text NOT NULL,
    file_url text NOT NULL,
    mime_type text,
    file_size_bytes bigint,
    checksum text,
    archived_at timestamp without time zone DEFAULT now() NOT NULL,
    notes text,
    created_by text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    CONSTRAINT stock_documents_document_type_check CHECK ((document_type = ANY (ARRAY['purchase_invoice'::text, 'transporter_bill'::text, 'gatepass'::text, 'sales_invoice'::text, 'delivery_receipt'::text, 'customer_acknowledgement'::text, 'photo_evidence'::text, 'other'::text]))),
    CONSTRAINT stock_documents_entity_type_check CHECK ((entity_type = ANY (ARRAY['purchase_order'::text, 'inbound_shipment'::text, 'sales_order'::text, 'outbound_shipment'::text, 'acknowledgement'::text, 'movement'::text, 'customer'::text, 'supplier'::text, 'other'::text])))
);


--
-- Name: stock_documents_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.stock_documents_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: stock_documents_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.stock_documents_id_seq OWNED BY public.stock_documents.id;


--
-- Name: stock_holidays; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stock_holidays (
    id bigint NOT NULL,
    holiday_date date NOT NULL,
    name text NOT NULL,
    created_by bigint,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: stock_holidays_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.stock_holidays_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: stock_holidays_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.stock_holidays_id_seq OWNED BY public.stock_holidays.id;


--
-- Name: stock_inbound_freight_backup; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stock_inbound_freight_backup (
    shipment_id bigint NOT NULL,
    delivery_cost numeric(14,2),
    unloading_labour_cost numeric(14,2),
    backed_up_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: stock_inbound_shipment_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stock_inbound_shipment_items (
    id bigint NOT NULL,
    inbound_shipment_id bigint NOT NULL,
    item_id bigint NOT NULL,
    ordered_qty integer DEFAULT 0 NOT NULL,
    received_whole_qty integer DEFAULT 0 NOT NULL,
    received_broken_qty integer DEFAULT 0 NOT NULL,
    rejected_qty integer DEFAULT 0 NOT NULL,
    unit_cost numeric(12,2) DEFAULT 0 NOT NULL,
    landed_cost numeric(12,2) DEFAULT 0 NOT NULL,
    whole_inventory_lot_id bigint,
    broken_inventory_lot_id bigint,
    notes text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    hsn_code text,
    qty_sqm numeric(14,3),
    cost_per_sqm numeric(12,2),
    thickness_mm_snapshot numeric(10,2),
    whole_qty_sqm numeric(14,3),
    broken_qty_sqm numeric(14,3),
    ordered_qty_sqm numeric(14,3),
    total_cost numeric(14,2) DEFAULT 0 NOT NULL,
    discount_amount numeric(14,2) DEFAULT 0 NOT NULL,
    received_qty_sqft numeric(14,3) DEFAULT 0 NOT NULL,
    cost_per_sqft numeric(12,2),
    slab_size_label text
);


--
-- Name: stock_inbound_shipment_items_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.stock_inbound_shipment_items_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: stock_inbound_shipment_items_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.stock_inbound_shipment_items_id_seq OWNED BY public.stock_inbound_shipment_items.id;


--
-- Name: stock_inbound_shipments_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.stock_inbound_shipments_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: stock_inbound_shipments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.stock_inbound_shipments_id_seq OWNED BY public.stock_inbound_shipments.id;


--
-- Name: stock_inbound_trips; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stock_inbound_trips (
    id bigint NOT NULL,
    arrival_date date DEFAULT CURRENT_DATE NOT NULL,
    truck_license_plate text,
    plate_key text GENERATED ALWAYS AS (regexp_replace(upper(COALESCE(truck_license_plate, ''::text)), '[^A-Z0-9]'::text, ''::text, 'g'::text)) STORED,
    driver_name text,
    transporter_id bigint,
    delivery_cost numeric(14,2) DEFAULT 0 NOT NULL,
    unloading_labour_cost numeric(14,2) DEFAULT 0 NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    CONSTRAINT stock_inbound_trips_delivery_cost_check CHECK ((delivery_cost >= (0)::numeric)),
    CONSTRAINT stock_inbound_trips_unloading_labour_cost_check CHECK ((unloading_labour_cost >= (0)::numeric))
);


--
-- Name: stock_inbound_trips_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.stock_inbound_trips_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: stock_inbound_trips_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.stock_inbound_trips_id_seq OWNED BY public.stock_inbound_trips.id;


--
-- Name: stock_inventory_lots_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.stock_inventory_lots_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: stock_inventory_lots_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.stock_inventory_lots_id_seq OWNED BY public.stock_inventory_lots.id;


--
-- Name: stock_sizes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stock_sizes (
    id bigint NOT NULL,
    label text NOT NULL,
    width_mm numeric(10,2),
    length_mm numeric(10,2),
    thickness_mm numeric(10,2),
    unit text DEFAULT 'mm'::text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: stock_types; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stock_types (
    id bigint NOT NULL,
    name text NOT NULL,
    name_hi text,
    description text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    category text DEFAULT 'tile'::text NOT NULL,
    CONSTRAINT stock_types_category_check CHECK ((category = ANY (ARRAY['tile'::text, 'bag'::text, 'stone'::text])))
);


--
-- Name: stock_item_balance_view; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.stock_item_balance_view AS
 SELECT i.id AS item_id,
    i.sku,
    i.name,
    b.name AS brand_name,
    t.name AS type_name,
    s.label AS size_label,
    COALESCE(sum(
        CASE
            WHEN (l.tile_condition = 'whole'::text) THEN l.quantity_available
            ELSE 0
        END), (0)::bigint) AS whole_available_qty,
    COALESCE(sum(
        CASE
            WHEN (l.tile_condition = 'broken'::text) THEN l.quantity_available
            ELSE 0
        END), (0)::bigint) AS broken_available_qty,
    COALESCE(sum(l.quantity_reserved), (0)::bigint) AS reserved_qty
   FROM ((((public.stock_items i
     LEFT JOIN public.stock_brands b ON ((b.id = i.brand_id)))
     LEFT JOIN public.stock_types t ON ((t.id = i.type_id)))
     LEFT JOIN public.stock_sizes s ON ((s.id = i.size_id)))
     LEFT JOIN public.stock_inventory_lots l ON ((l.item_id = i.id)))
  GROUP BY i.id, i.sku, i.name, b.name, t.name, s.label;


--
-- Name: stock_items_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.stock_items_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: stock_items_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.stock_items_id_seq OWNED BY public.stock_items.id;


--
-- Name: stock_kiosk_devices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stock_kiosk_devices (
    id bigint NOT NULL,
    label text NOT NULL,
    token_hash text NOT NULL,
    location_id bigint,
    is_active boolean DEFAULT true NOT NULL,
    last_seen_at timestamp without time zone,
    created_by bigint,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: stock_kiosk_devices_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.stock_kiosk_devices_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: stock_kiosk_devices_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.stock_kiosk_devices_id_seq OWNED BY public.stock_kiosk_devices.id;


--
-- Name: stock_leave_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stock_leave_requests (
    id bigint NOT NULL,
    user_id bigint NOT NULL,
    from_date date NOT NULL,
    to_date date NOT NULL,
    leave_type text DEFAULT 'paid'::text NOT NULL,
    reason text,
    status text DEFAULT 'pending'::text NOT NULL,
    decided_by bigint,
    decided_at timestamp without time zone,
    decision_note text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    CONSTRAINT stock_leave_requests_leave_type_check CHECK ((leave_type = ANY (ARRAY['paid'::text, 'unpaid'::text, 'sick'::text, 'casual'::text]))),
    CONSTRAINT stock_leave_requests_range_valid CHECK ((to_date >= from_date)),
    CONSTRAINT stock_leave_requests_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])))
);


--
-- Name: stock_leave_requests_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.stock_leave_requests_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: stock_leave_requests_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.stock_leave_requests_id_seq OWNED BY public.stock_leave_requests.id;


--
-- Name: stock_locations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stock_locations (
    id bigint NOT NULL,
    name text NOT NULL,
    location_type text DEFAULT 'warehouse'::text NOT NULL,
    address text,
    contact_name text,
    contact_phone text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    latitude numeric(9,6),
    longitude numeric(9,6),
    business_id bigint,
    CONSTRAINT stock_locations_location_type_check CHECK ((location_type = ANY (ARRAY['warehouse'::text, 'yard'::text, 'showroom'::text, 'in_transit'::text, 'customer_site'::text, 'supplier_site'::text, 'other'::text])))
);


--
-- Name: stock_locations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.stock_locations_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: stock_locations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.stock_locations_id_seq OWNED BY public.stock_locations.id;


--
-- Name: stock_movements_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.stock_movements_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: stock_movements_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.stock_movements_id_seq OWNED BY public.stock_movements.id;


--
-- Name: stock_notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stock_notifications (
    id bigint NOT NULL,
    notification_number text NOT NULL,
    channel text NOT NULL,
    event_type text NOT NULL,
    recipients jsonb DEFAULT '[]'::jsonb NOT NULL,
    message_text text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    provider_name text,
    provider_message_id text,
    sent_at timestamp without time zone,
    error_message text,
    source_table text,
    source_id bigint,
    created_by text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    is_read boolean DEFAULT false NOT NULL,
    read_at timestamp without time zone,
    CONSTRAINT stock_notifications_channel_check CHECK ((channel = ANY (ARRAY['whatsapp'::text, 'sms'::text, 'email'::text, 'internal'::text]))),
    CONSTRAINT stock_notifications_event_type_check CHECK ((event_type = ANY (ARRAY['inbound_arrival'::text, 'inbound_received'::text, 'outbound_dispatch'::text, 'low_stock'::text, 'damage_report'::text, 'customer_acknowledged'::text, 'payment_update'::text, 'other'::text]))),
    CONSTRAINT stock_notifications_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'queued'::text, 'sent'::text, 'failed'::text, 'cancelled'::text])))
);


--
-- Name: stock_notifications_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.stock_notifications_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: stock_notifications_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.stock_notifications_id_seq OWNED BY public.stock_notifications.id;


--
-- Name: stock_outbound_shipment_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stock_outbound_shipment_items (
    id bigint NOT NULL,
    outbound_shipment_id bigint NOT NULL,
    item_id bigint NOT NULL,
    loaded_whole_qty integer DEFAULT 0 NOT NULL,
    loaded_broken_qty integer DEFAULT 0 NOT NULL,
    delivered_whole_qty integer DEFAULT 0 NOT NULL,
    delivered_broken_qty integer DEFAULT 0 NOT NULL,
    returned_whole_qty integer DEFAULT 0 NOT NULL,
    returned_broken_qty integer DEFAULT 0 NOT NULL,
    notes text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    sell_unit text DEFAULT 'box'::text NOT NULL,
    rate_per_unit numeric(12,2),
    qty_sqft numeric(14,3) DEFAULT 0 NOT NULL,
    returned_qty_sqft numeric(14,3) DEFAULT 0 NOT NULL
);


--
-- Name: stock_outbound_shipment_items_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.stock_outbound_shipment_items_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: stock_outbound_shipment_items_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.stock_outbound_shipment_items_id_seq OWNED BY public.stock_outbound_shipment_items.id;


--
-- Name: stock_outbound_shipments_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.stock_outbound_shipments_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: stock_outbound_shipments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.stock_outbound_shipments_id_seq OWNED BY public.stock_outbound_shipments.id;


--
-- Name: stock_purchase_orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stock_purchase_orders (
    id bigint NOT NULL,
    po_number text NOT NULL,
    supplier_id bigint,
    order_date date DEFAULT CURRENT_DATE NOT NULL,
    expected_arrival_date date,
    status text DEFAULT 'draft'::text NOT NULL,
    subtotal numeric(14,2) DEFAULT 0 NOT NULL,
    tax_amount numeric(14,2) DEFAULT 0 NOT NULL,
    delivery_cost numeric(14,2) DEFAULT 0 NOT NULL,
    unloading_labour_cost numeric(14,2) DEFAULT 0 NOT NULL,
    transporter_bill_amount numeric(14,2) DEFAULT 0 NOT NULL,
    total_amount numeric(14,2) DEFAULT 0 NOT NULL,
    notes text,
    created_by text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    CONSTRAINT stock_purchase_orders_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'ordered'::text, 'partially_received'::text, 'received'::text, 'cancelled'::text])))
);


--
-- Name: TABLE stock_purchase_orders; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.stock_purchase_orders IS 'DEPRECATED_PHASE1_2026-04-18: read-only compatibility table';


--
-- Name: stock_purchase_orders_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.stock_purchase_orders_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: stock_purchase_orders_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.stock_purchase_orders_id_seq OWNED BY public.stock_purchase_orders.id;


--
-- Name: stock_sales_invoices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stock_sales_invoices (
    id bigint NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    location_id bigint NOT NULL,
    business_id bigint NOT NULL,
    seller_snapshot jsonb,
    invoice_number text,
    fiscal_year text,
    invoice_seq integer,
    invoice_date date,
    customer_id bigint,
    bill_to_name text NOT NULL,
    bill_to_phone text,
    bill_to_address text,
    bill_to_gstin text,
    bill_to_state_code text NOT NULL,
    ship_to_address text,
    salesperson_user_id bigint,
    items jsonb NOT NULL,
    taxable_total numeric(14,2) DEFAULT 0 NOT NULL,
    cgst numeric(14,2) DEFAULT 0 NOT NULL,
    sgst numeric(14,2) DEFAULT 0 NOT NULL,
    igst numeric(14,2) DEFAULT 0 NOT NULL,
    grand_total numeric(14,2) DEFAULT 0 NOT NULL,
    notes text,
    rejection_reason text,
    created_by_user_id bigint,
    approved_by_user_id bigint,
    approved_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    bill_to_city text,
    bill_to_pincode text,
    ship_to_pincode text,
    einvoice_status text DEFAULT 'not_required'::text NOT NULL,
    irn text,
    ack_no text,
    ack_date text,
    signed_qr text,
    CONSTRAINT stock_sales_invoices_einvoice_status_check CHECK ((einvoice_status = ANY (ARRAY['not_required'::text, 'pending'::text, 'generated'::text, 'cancelled'::text]))),
    CONSTRAINT stock_sales_invoices_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'cancelled'::text])))
);


--
-- Name: stock_sales_invoices_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.stock_sales_invoices_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: stock_sales_invoices_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.stock_sales_invoices_id_seq OWNED BY public.stock_sales_invoices.id;


--
-- Name: stock_sales_orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stock_sales_orders (
    id bigint NOT NULL,
    order_number text NOT NULL,
    customer_id bigint,
    order_date date DEFAULT CURRENT_DATE NOT NULL,
    expected_dispatch_date date,
    status text DEFAULT 'draft'::text NOT NULL,
    subtotal numeric(14,2) DEFAULT 0 NOT NULL,
    discount_amount numeric(14,2) DEFAULT 0 NOT NULL,
    tax_amount numeric(14,2) DEFAULT 0 NOT NULL,
    delivery_charge numeric(14,2) DEFAULT 0 NOT NULL,
    loading_labour_cost numeric(14,2) DEFAULT 0 NOT NULL,
    transport_cost numeric(14,2) DEFAULT 0 NOT NULL,
    total_amount numeric(14,2) DEFAULT 0 NOT NULL,
    notes text,
    created_by text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    salesperson_id bigint,
    CONSTRAINT stock_sales_orders_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'confirmed'::text, 'picked'::text, 'dispatched'::text, 'delivered'::text, 'partially_returned'::text, 'returned'::text, 'cancelled'::text])))
);


--
-- Name: stock_sales_orders_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.stock_sales_orders_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: stock_sales_orders_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.stock_sales_orders_id_seq OWNED BY public.stock_sales_orders.id;


--
-- Name: stock_sales_people; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stock_sales_people (
    id bigint NOT NULL,
    name text NOT NULL,
    phone text NOT NULL,
    email text,
    whatsapp_phone text,
    notes text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: stock_sales_people_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.stock_sales_people_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: stock_sales_people_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.stock_sales_people_id_seq OWNED BY public.stock_sales_people.id;


--
-- Name: stock_showroom_stock; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stock_showroom_stock (
    id bigint NOT NULL,
    item_id bigint NOT NULL,
    location_id bigint NOT NULL,
    whole_qty integer DEFAULT 0 NOT NULL,
    sqft numeric(14,3) DEFAULT 0 NOT NULL,
    installed_whole_qty integer DEFAULT 0 NOT NULL,
    installed_sqft numeric(14,3) DEFAULT 0 NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    CONSTRAINT stock_showroom_stock_installed_subset CHECK (((installed_whole_qty <= whole_qty) AND (installed_sqft <= sqft))),
    CONSTRAINT stock_showroom_stock_nonnegative CHECK (((whole_qty >= 0) AND (sqft >= (0)::numeric) AND (installed_whole_qty >= 0) AND (installed_sqft >= (0)::numeric)))
);


--
-- Name: stock_showroom_stock_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.stock_showroom_stock_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: stock_showroom_stock_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.stock_showroom_stock_id_seq OWNED BY public.stock_showroom_stock.id;


--
-- Name: stock_sizes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.stock_sizes_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: stock_sizes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.stock_sizes_id_seq OWNED BY public.stock_sizes.id;


--
-- Name: stock_suppliers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stock_suppliers (
    id bigint NOT NULL,
    name text NOT NULL,
    gst_number text,
    phone text,
    email text,
    address text,
    notes text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: stock_suppliers_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.stock_suppliers_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: stock_suppliers_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.stock_suppliers_id_seq OWNED BY public.stock_suppliers.id;


--
-- Name: stock_timeline_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stock_timeline_events (
    id bigint NOT NULL,
    event_number text NOT NULL,
    event_type text NOT NULL,
    entity_type text NOT NULL,
    entity_id bigint,
    occurred_at timestamp without time zone DEFAULT now() NOT NULL,
    recorded_by_user_id bigint,
    summary text NOT NULL,
    details jsonb,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    CONSTRAINT stock_timeline_events_event_type_check CHECK ((event_type = ANY (ARRAY['inbound_submitted'::text, 'inbound_reviewed'::text, 'inbound_approved'::text, 'inbound_received'::text, 'outbound_submitted'::text, 'outbound_reviewed'::text, 'outbound_approved'::text, 'outbound_dispatched'::text, 'customer_acknowledged'::text, 'change_requested'::text, 'change_approved'::text, 'change_rejected'::text, 'user_created'::text, 'user_removed'::text, 'login'::text, 'logout'::text, 'other'::text])))
);


--
-- Name: stock_timeline_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.stock_timeline_events_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: stock_timeline_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.stock_timeline_events_id_seq OWNED BY public.stock_timeline_events.id;


--
-- Name: stock_transporters; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stock_transporters (
    id bigint NOT NULL,
    name text NOT NULL,
    contact_name text,
    phone text,
    vehicle_number text,
    gst_number text,
    address text,
    notes text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: stock_transporters_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.stock_transporters_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: stock_transporters_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.stock_transporters_id_seq OWNED BY public.stock_transporters.id;


--
-- Name: stock_types_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.stock_types_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: stock_types_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.stock_types_id_seq OWNED BY public.stock_types.id;


--
-- Name: stock_user_divisions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stock_user_divisions (
    id bigint NOT NULL,
    user_id bigint NOT NULL,
    division_id bigint NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: stock_user_divisions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.stock_user_divisions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: stock_user_divisions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.stock_user_divisions_id_seq OWNED BY public.stock_user_divisions.id;


--
-- Name: stock_vehicles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stock_vehicles (
    id bigint NOT NULL,
    vehicle_number text NOT NULL,
    vehicle_type text,
    driver_name text,
    driver_phone text,
    transporter_id bigint,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: stock_vehicles_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.stock_vehicles_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: stock_vehicles_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.stock_vehicles_id_seq OWNED BY public.stock_vehicles.id;


--
-- Name: user; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."user" (
    id text NOT NULL,
    name text NOT NULL,
    email text NOT NULL,
    "emailVerified" boolean NOT NULL,
    image text,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    role text,
    banned boolean,
    "banReason" text,
    "banExpires" timestamp with time zone
);


--
-- Name: verification; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.verification (
    id text NOT NULL,
    identifier text NOT NULL,
    value text NOT NULL,
    "expiresAt" timestamp with time zone NOT NULL,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: acc_ledgers id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.acc_ledgers ALTER COLUMN id SET DEFAULT nextval('public.acc_ledgers_id_seq'::regclass);


--
-- Name: acc_voucher_lines id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.acc_voucher_lines ALTER COLUMN id SET DEFAULT nextval('public.acc_voucher_lines_id_seq'::regclass);


--
-- Name: acc_vouchers id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.acc_vouchers ALTER COLUMN id SET DEFAULT nextval('public.acc_vouchers_id_seq'::regclass);


--
-- Name: stock_app_users id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_app_users ALTER COLUMN id SET DEFAULT nextval('public.stock_app_users_id_seq'::regclass);


--
-- Name: stock_attendance_entries id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_attendance_entries ALTER COLUMN id SET DEFAULT nextval('public.stock_attendance_entries_id_seq'::regclass);


--
-- Name: stock_audit_logs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_audit_logs ALTER COLUMN id SET DEFAULT nextval('public.stock_audit_logs_id_seq'::regclass);


--
-- Name: stock_brands id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_brands ALTER COLUMN id SET DEFAULT nextval('public.stock_brands_id_seq'::regclass);


--
-- Name: stock_businesses id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_businesses ALTER COLUMN id SET DEFAULT nextval('public.stock_businesses_id_seq'::regclass);


--
-- Name: stock_change_requests id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_change_requests ALTER COLUMN id SET DEFAULT nextval('public.stock_change_requests_id_seq'::regclass);


--
-- Name: stock_customer_acknowledgements id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_customer_acknowledgements ALTER COLUMN id SET DEFAULT nextval('public.stock_customer_acknowledgements_id_seq'::regclass);


--
-- Name: stock_customers id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_customers ALTER COLUMN id SET DEFAULT nextval('public.stock_customers_id_seq'::regclass);


--
-- Name: stock_divisions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_divisions ALTER COLUMN id SET DEFAULT nextval('public.stock_divisions_id_seq'::regclass);


--
-- Name: stock_documents id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_documents ALTER COLUMN id SET DEFAULT nextval('public.stock_documents_id_seq'::regclass);


--
-- Name: stock_holidays id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_holidays ALTER COLUMN id SET DEFAULT nextval('public.stock_holidays_id_seq'::regclass);


--
-- Name: stock_inbound_shipment_items id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_inbound_shipment_items ALTER COLUMN id SET DEFAULT nextval('public.stock_inbound_shipment_items_id_seq'::regclass);


--
-- Name: stock_inbound_shipments id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_inbound_shipments ALTER COLUMN id SET DEFAULT nextval('public.stock_inbound_shipments_id_seq'::regclass);


--
-- Name: stock_inbound_trips id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_inbound_trips ALTER COLUMN id SET DEFAULT nextval('public.stock_inbound_trips_id_seq'::regclass);


--
-- Name: stock_inventory_lots id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_inventory_lots ALTER COLUMN id SET DEFAULT nextval('public.stock_inventory_lots_id_seq'::regclass);


--
-- Name: stock_items id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_items ALTER COLUMN id SET DEFAULT nextval('public.stock_items_id_seq'::regclass);


--
-- Name: stock_kiosk_devices id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_kiosk_devices ALTER COLUMN id SET DEFAULT nextval('public.stock_kiosk_devices_id_seq'::regclass);


--
-- Name: stock_leave_requests id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_leave_requests ALTER COLUMN id SET DEFAULT nextval('public.stock_leave_requests_id_seq'::regclass);


--
-- Name: stock_locations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_locations ALTER COLUMN id SET DEFAULT nextval('public.stock_locations_id_seq'::regclass);


--
-- Name: stock_movements id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_movements ALTER COLUMN id SET DEFAULT nextval('public.stock_movements_id_seq'::regclass);


--
-- Name: stock_notifications id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_notifications ALTER COLUMN id SET DEFAULT nextval('public.stock_notifications_id_seq'::regclass);


--
-- Name: stock_outbound_shipment_items id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_outbound_shipment_items ALTER COLUMN id SET DEFAULT nextval('public.stock_outbound_shipment_items_id_seq'::regclass);


--
-- Name: stock_outbound_shipments id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_outbound_shipments ALTER COLUMN id SET DEFAULT nextval('public.stock_outbound_shipments_id_seq'::regclass);


--
-- Name: stock_purchase_orders id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_purchase_orders ALTER COLUMN id SET DEFAULT nextval('public.stock_purchase_orders_id_seq'::regclass);


--
-- Name: stock_sales_invoices id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_sales_invoices ALTER COLUMN id SET DEFAULT nextval('public.stock_sales_invoices_id_seq'::regclass);


--
-- Name: stock_sales_orders id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_sales_orders ALTER COLUMN id SET DEFAULT nextval('public.stock_sales_orders_id_seq'::regclass);


--
-- Name: stock_sales_people id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_sales_people ALTER COLUMN id SET DEFAULT nextval('public.stock_sales_people_id_seq'::regclass);


--
-- Name: stock_showroom_stock id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_showroom_stock ALTER COLUMN id SET DEFAULT nextval('public.stock_showroom_stock_id_seq'::regclass);


--
-- Name: stock_sizes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_sizes ALTER COLUMN id SET DEFAULT nextval('public.stock_sizes_id_seq'::regclass);


--
-- Name: stock_suppliers id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_suppliers ALTER COLUMN id SET DEFAULT nextval('public.stock_suppliers_id_seq'::regclass);


--
-- Name: stock_timeline_events id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_timeline_events ALTER COLUMN id SET DEFAULT nextval('public.stock_timeline_events_id_seq'::regclass);


--
-- Name: stock_transporters id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_transporters ALTER COLUMN id SET DEFAULT nextval('public.stock_transporters_id_seq'::regclass);


--
-- Name: stock_types id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_types ALTER COLUMN id SET DEFAULT nextval('public.stock_types_id_seq'::regclass);


--
-- Name: stock_user_divisions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_user_divisions ALTER COLUMN id SET DEFAULT nextval('public.stock_user_divisions_id_seq'::regclass);


--
-- Name: stock_vehicles id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_vehicles ALTER COLUMN id SET DEFAULT nextval('public.stock_vehicles_id_seq'::regclass);


--
-- Name: acc_fiscal_years acc_fiscal_years_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.acc_fiscal_years
    ADD CONSTRAINT acc_fiscal_years_pkey PRIMARY KEY (business_id, fiscal_year);


--
-- Name: acc_ledgers acc_ledgers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.acc_ledgers
    ADD CONSTRAINT acc_ledgers_pkey PRIMARY KEY (id);


--
-- Name: acc_voucher_lines acc_voucher_lines_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.acc_voucher_lines
    ADD CONSTRAINT acc_voucher_lines_pkey PRIMARY KEY (id);


--
-- Name: acc_vouchers acc_vouchers_business_id_voucher_type_fiscal_year_seq_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.acc_vouchers
    ADD CONSTRAINT acc_vouchers_business_id_voucher_type_fiscal_year_seq_key UNIQUE (business_id, voucher_type, fiscal_year, seq);


--
-- Name: acc_vouchers acc_vouchers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.acc_vouchers
    ADD CONSTRAINT acc_vouchers_pkey PRIMARY KEY (id);


--
-- Name: account account_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.account
    ADD CONSTRAINT account_pkey PRIMARY KEY (id);


--
-- Name: session session_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session
    ADD CONSTRAINT session_pkey PRIMARY KEY (id);


--
-- Name: session session_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session
    ADD CONSTRAINT session_token_key UNIQUE (token);


--
-- Name: stock_app_users stock_app_users_auth0_sub_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_app_users
    ADD CONSTRAINT stock_app_users_auth0_sub_key UNIQUE (auth0_sub);


--
-- Name: stock_app_users stock_app_users_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_app_users
    ADD CONSTRAINT stock_app_users_email_key UNIQUE (email);


--
-- Name: stock_app_users stock_app_users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_app_users
    ADD CONSTRAINT stock_app_users_pkey PRIMARY KEY (id);


--
-- Name: stock_attendance_entries stock_attendance_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_attendance_entries
    ADD CONSTRAINT stock_attendance_entries_pkey PRIMARY KEY (id);


--
-- Name: stock_attendance_settings stock_attendance_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_attendance_settings
    ADD CONSTRAINT stock_attendance_settings_pkey PRIMARY KEY (id);


--
-- Name: stock_audit_logs stock_audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_audit_logs
    ADD CONSTRAINT stock_audit_logs_pkey PRIMARY KEY (id);


--
-- Name: stock_brands stock_brands_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_brands
    ADD CONSTRAINT stock_brands_name_key UNIQUE (name);


--
-- Name: stock_brands stock_brands_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_brands
    ADD CONSTRAINT stock_brands_pkey PRIMARY KEY (id);


--
-- Name: stock_businesses stock_businesses_gstin_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_businesses
    ADD CONSTRAINT stock_businesses_gstin_key UNIQUE (gstin);


--
-- Name: stock_businesses stock_businesses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_businesses
    ADD CONSTRAINT stock_businesses_pkey PRIMARY KEY (id);


--
-- Name: stock_change_requests stock_change_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_change_requests
    ADD CONSTRAINT stock_change_requests_pkey PRIMARY KEY (id);


--
-- Name: stock_change_requests stock_change_requests_request_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_change_requests
    ADD CONSTRAINT stock_change_requests_request_number_key UNIQUE (request_number);


--
-- Name: stock_customer_acknowledgements stock_customer_acknowledgements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_customer_acknowledgements
    ADD CONSTRAINT stock_customer_acknowledgements_pkey PRIMARY KEY (id);


--
-- Name: stock_customers stock_customers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_customers
    ADD CONSTRAINT stock_customers_pkey PRIMARY KEY (id);


--
-- Name: stock_divisions stock_divisions_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_divisions
    ADD CONSTRAINT stock_divisions_name_key UNIQUE (name);


--
-- Name: stock_divisions stock_divisions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_divisions
    ADD CONSTRAINT stock_divisions_pkey PRIMARY KEY (id);


--
-- Name: stock_documents stock_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_documents
    ADD CONSTRAINT stock_documents_pkey PRIMARY KEY (id);


--
-- Name: stock_holidays stock_holidays_holiday_date_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_holidays
    ADD CONSTRAINT stock_holidays_holiday_date_key UNIQUE (holiday_date);


--
-- Name: stock_holidays stock_holidays_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_holidays
    ADD CONSTRAINT stock_holidays_pkey PRIMARY KEY (id);


--
-- Name: stock_inbound_freight_backup stock_inbound_freight_backup_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_inbound_freight_backup
    ADD CONSTRAINT stock_inbound_freight_backup_pkey PRIMARY KEY (shipment_id);


--
-- Name: stock_inbound_shipment_items stock_inbound_shipment_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_inbound_shipment_items
    ADD CONSTRAINT stock_inbound_shipment_items_pkey PRIMARY KEY (id);


--
-- Name: stock_inbound_shipments stock_inbound_shipments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_inbound_shipments
    ADD CONSTRAINT stock_inbound_shipments_pkey PRIMARY KEY (id);


--
-- Name: stock_inbound_shipments stock_inbound_shipments_shipment_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_inbound_shipments
    ADD CONSTRAINT stock_inbound_shipments_shipment_number_key UNIQUE (shipment_number);


--
-- Name: stock_inbound_trips stock_inbound_trips_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_inbound_trips
    ADD CONSTRAINT stock_inbound_trips_pkey PRIMARY KEY (id);


--
-- Name: stock_inventory_lots stock_inventory_lots_lot_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_inventory_lots
    ADD CONSTRAINT stock_inventory_lots_lot_number_key UNIQUE (lot_number);


--
-- Name: stock_inventory_lots stock_inventory_lots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_inventory_lots
    ADD CONSTRAINT stock_inventory_lots_pkey PRIMARY KEY (id);


--
-- Name: stock_items stock_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_items
    ADD CONSTRAINT stock_items_pkey PRIMARY KEY (id);


--
-- Name: stock_items stock_items_sku_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_items
    ADD CONSTRAINT stock_items_sku_key UNIQUE (sku);


--
-- Name: stock_kiosk_devices stock_kiosk_devices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_kiosk_devices
    ADD CONSTRAINT stock_kiosk_devices_pkey PRIMARY KEY (id);


--
-- Name: stock_kiosk_devices stock_kiosk_devices_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_kiosk_devices
    ADD CONSTRAINT stock_kiosk_devices_token_hash_key UNIQUE (token_hash);


--
-- Name: stock_leave_requests stock_leave_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_leave_requests
    ADD CONSTRAINT stock_leave_requests_pkey PRIMARY KEY (id);


--
-- Name: stock_locations stock_locations_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_locations
    ADD CONSTRAINT stock_locations_name_key UNIQUE (name);


--
-- Name: stock_locations stock_locations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_locations
    ADD CONSTRAINT stock_locations_pkey PRIMARY KEY (id);


--
-- Name: stock_movements stock_movements_movement_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_movements
    ADD CONSTRAINT stock_movements_movement_number_key UNIQUE (movement_number);


--
-- Name: stock_movements stock_movements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_movements
    ADD CONSTRAINT stock_movements_pkey PRIMARY KEY (id);


--
-- Name: stock_notifications stock_notifications_notification_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_notifications
    ADD CONSTRAINT stock_notifications_notification_number_key UNIQUE (notification_number);


--
-- Name: stock_notifications stock_notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_notifications
    ADD CONSTRAINT stock_notifications_pkey PRIMARY KEY (id);


--
-- Name: stock_outbound_shipment_items stock_outbound_shipment_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_outbound_shipment_items
    ADD CONSTRAINT stock_outbound_shipment_items_pkey PRIMARY KEY (id);


--
-- Name: stock_outbound_shipments stock_outbound_shipments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_outbound_shipments
    ADD CONSTRAINT stock_outbound_shipments_pkey PRIMARY KEY (id);


--
-- Name: stock_outbound_shipments stock_outbound_shipments_shipment_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_outbound_shipments
    ADD CONSTRAINT stock_outbound_shipments_shipment_number_key UNIQUE (shipment_number);


--
-- Name: stock_purchase_orders stock_purchase_orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_purchase_orders
    ADD CONSTRAINT stock_purchase_orders_pkey PRIMARY KEY (id);


--
-- Name: stock_purchase_orders stock_purchase_orders_po_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_purchase_orders
    ADD CONSTRAINT stock_purchase_orders_po_number_key UNIQUE (po_number);


--
-- Name: stock_sales_invoices stock_sales_invoices_business_id_fiscal_year_invoice_seq_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_sales_invoices
    ADD CONSTRAINT stock_sales_invoices_business_id_fiscal_year_invoice_seq_key UNIQUE (business_id, fiscal_year, invoice_seq);


--
-- Name: stock_sales_invoices stock_sales_invoices_invoice_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_sales_invoices
    ADD CONSTRAINT stock_sales_invoices_invoice_number_key UNIQUE (invoice_number);


--
-- Name: stock_sales_invoices stock_sales_invoices_irn_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_sales_invoices
    ADD CONSTRAINT stock_sales_invoices_irn_key UNIQUE (irn);


--
-- Name: stock_sales_invoices stock_sales_invoices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_sales_invoices
    ADD CONSTRAINT stock_sales_invoices_pkey PRIMARY KEY (id);


--
-- Name: stock_sales_orders stock_sales_orders_order_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_sales_orders
    ADD CONSTRAINT stock_sales_orders_order_number_key UNIQUE (order_number);


--
-- Name: stock_sales_orders stock_sales_orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_sales_orders
    ADD CONSTRAINT stock_sales_orders_pkey PRIMARY KEY (id);


--
-- Name: stock_sales_people stock_sales_people_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_sales_people
    ADD CONSTRAINT stock_sales_people_pkey PRIMARY KEY (id);


--
-- Name: stock_showroom_stock stock_showroom_stock_item_id_location_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_showroom_stock
    ADD CONSTRAINT stock_showroom_stock_item_id_location_id_key UNIQUE (item_id, location_id);


--
-- Name: stock_showroom_stock stock_showroom_stock_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_showroom_stock
    ADD CONSTRAINT stock_showroom_stock_pkey PRIMARY KEY (id);


--
-- Name: stock_sizes stock_sizes_label_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_sizes
    ADD CONSTRAINT stock_sizes_label_key UNIQUE (label);


--
-- Name: stock_sizes stock_sizes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_sizes
    ADD CONSTRAINT stock_sizes_pkey PRIMARY KEY (id);


--
-- Name: stock_suppliers stock_suppliers_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_suppliers
    ADD CONSTRAINT stock_suppliers_name_key UNIQUE (name);


--
-- Name: stock_suppliers stock_suppliers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_suppliers
    ADD CONSTRAINT stock_suppliers_pkey PRIMARY KEY (id);


--
-- Name: stock_timeline_events stock_timeline_events_event_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_timeline_events
    ADD CONSTRAINT stock_timeline_events_event_number_key UNIQUE (event_number);


--
-- Name: stock_timeline_events stock_timeline_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_timeline_events
    ADD CONSTRAINT stock_timeline_events_pkey PRIMARY KEY (id);


--
-- Name: stock_transporters stock_transporters_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_transporters
    ADD CONSTRAINT stock_transporters_name_key UNIQUE (name);


--
-- Name: stock_transporters stock_transporters_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_transporters
    ADD CONSTRAINT stock_transporters_pkey PRIMARY KEY (id);


--
-- Name: stock_types stock_types_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_types
    ADD CONSTRAINT stock_types_name_key UNIQUE (name);


--
-- Name: stock_types stock_types_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_types
    ADD CONSTRAINT stock_types_pkey PRIMARY KEY (id);


--
-- Name: stock_user_divisions stock_user_divisions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_user_divisions
    ADD CONSTRAINT stock_user_divisions_pkey PRIMARY KEY (id);


--
-- Name: stock_user_divisions stock_user_divisions_user_id_division_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_user_divisions
    ADD CONSTRAINT stock_user_divisions_user_id_division_id_key UNIQUE (user_id, division_id);


--
-- Name: stock_vehicles stock_vehicles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_vehicles
    ADD CONSTRAINT stock_vehicles_pkey PRIMARY KEY (id);


--
-- Name: stock_vehicles stock_vehicles_vehicle_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_vehicles
    ADD CONSTRAINT stock_vehicles_vehicle_number_key UNIQUE (vehicle_number);


--
-- Name: user user_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."user"
    ADD CONSTRAINT user_email_key UNIQUE (email);


--
-- Name: user user_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."user"
    ADD CONSTRAINT user_pkey PRIMARY KEY (id);


--
-- Name: verification verification_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.verification
    ADD CONSTRAINT verification_pkey PRIMARY KEY (id);


--
-- Name: account_userId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "account_userId_idx" ON public.account USING btree ("userId");


--
-- Name: idx_acc_lines_ledger; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_acc_lines_ledger ON public.acc_voucher_lines USING btree (ledger_id, bill_ref);


--
-- Name: idx_acc_lines_voucher; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_acc_lines_voucher ON public.acc_voucher_lines USING btree (voucher_id);


--
-- Name: idx_acc_vouchers_daybook; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_acc_vouchers_daybook ON public.acc_vouchers USING btree (business_id, voucher_date DESC, id DESC);


--
-- Name: idx_app_users_default_location; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_app_users_default_location ON public.stock_app_users USING btree (default_location_id);


--
-- Name: idx_attendance_date_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_attendance_date_user ON public.stock_attendance_entries USING btree (work_date DESC, user_id);


--
-- Name: idx_attendance_location_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_attendance_location_date ON public.stock_attendance_entries USING btree (location_id, work_date DESC);


--
-- Name: idx_attendance_one_open; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_attendance_one_open ON public.stock_attendance_entries USING btree (user_id) WHERE ((clock_out_at IS NULL) AND is_active);


--
-- Name: idx_attendance_selfie_purge; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_attendance_selfie_purge ON public.stock_attendance_entries USING btree (work_date) WHERE ((in_selfie_key IS NOT NULL) OR (out_selfie_key IS NOT NULL));


--
-- Name: idx_attendance_user_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_attendance_user_date ON public.stock_attendance_entries USING btree (user_id, work_date DESC);


--
-- Name: idx_kiosk_devices_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_kiosk_devices_active ON public.stock_kiosk_devices USING btree (is_active) WHERE is_active;


--
-- Name: idx_leave_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_leave_status ON public.stock_leave_requests USING btree (status, created_at DESC);


--
-- Name: idx_leave_user_range; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_leave_user_range ON public.stock_leave_requests USING btree (user_id, from_date, to_date);


--
-- Name: idx_sales_invoices_salesperson; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sales_invoices_salesperson ON public.stock_sales_invoices USING btree (salesperson_user_id);


--
-- Name: idx_sales_invoices_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sales_invoices_status ON public.stock_sales_invoices USING btree (status, created_at DESC);


--
-- Name: idx_showroom_stock_item; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_showroom_stock_item ON public.stock_showroom_stock USING btree (item_id);


--
-- Name: idx_showroom_stock_location; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_showroom_stock_location ON public.stock_showroom_stock USING btree (location_id);


--
-- Name: idx_stock_app_users_division_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stock_app_users_division_id ON public.stock_app_users USING btree (division_id);


--
-- Name: idx_stock_app_users_role; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stock_app_users_role ON public.stock_app_users USING btree (role);


--
-- Name: idx_stock_app_users_role_department; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stock_app_users_role_department ON public.stock_app_users USING btree (role, department);


--
-- Name: idx_stock_app_users_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stock_app_users_status ON public.stock_app_users USING btree (status);


--
-- Name: idx_stock_audit_logs_action; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stock_audit_logs_action ON public.stock_audit_logs USING btree (action);


--
-- Name: idx_stock_audit_logs_timestamp; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stock_audit_logs_timestamp ON public.stock_audit_logs USING btree ("timestamp" DESC);


--
-- Name: idx_stock_audit_logs_user_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stock_audit_logs_user_email ON public.stock_audit_logs USING btree (user_email);


--
-- Name: idx_stock_brands_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stock_brands_name ON public.stock_brands USING btree (name);


--
-- Name: idx_stock_change_requests_requested_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stock_change_requests_requested_by ON public.stock_change_requests USING btree (requested_by_user_id);


--
-- Name: idx_stock_change_requests_source; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stock_change_requests_source ON public.stock_change_requests USING btree (source_entity_type, source_entity_id);


--
-- Name: idx_stock_change_requests_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stock_change_requests_status ON public.stock_change_requests USING btree (status);


--
-- Name: idx_stock_customer_ack_shipment_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stock_customer_ack_shipment_id ON public.stock_customer_acknowledgements USING btree (outbound_shipment_id);


--
-- Name: idx_stock_divisions_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stock_divisions_name ON public.stock_divisions USING btree (name);


--
-- Name: idx_stock_documents_entity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stock_documents_entity ON public.stock_documents USING btree (entity_type, entity_id);


--
-- Name: idx_stock_documents_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stock_documents_type ON public.stock_documents USING btree (document_type);


--
-- Name: idx_stock_inbound_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stock_inbound_created_at ON public.stock_inbound_shipments USING btree (created_at DESC);


--
-- Name: idx_stock_inbound_items_hsn_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stock_inbound_items_hsn_code ON public.stock_inbound_shipment_items USING btree (hsn_code);


--
-- Name: idx_stock_inbound_items_item_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stock_inbound_items_item_id ON public.stock_inbound_shipment_items USING btree (item_id);


--
-- Name: idx_stock_inbound_items_shipment_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stock_inbound_items_shipment_id ON public.stock_inbound_shipment_items USING btree (inbound_shipment_id);


--
-- Name: idx_stock_inbound_shipment_items_item_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stock_inbound_shipment_items_item_id ON public.stock_inbound_shipment_items USING btree (item_id);


--
-- Name: idx_stock_inbound_shipment_items_shipment_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stock_inbound_shipment_items_shipment_id ON public.stock_inbound_shipment_items USING btree (inbound_shipment_id);


--
-- Name: idx_stock_inbound_shipments_customer_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stock_inbound_shipments_customer_id ON public.stock_inbound_shipments USING btree (customer_id);


--
-- Name: idx_stock_inbound_shipments_dest_loc_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stock_inbound_shipments_dest_loc_id ON public.stock_inbound_shipments USING btree (destination_location_id);


--
-- Name: idx_stock_inbound_shipments_invoice_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stock_inbound_shipments_invoice_date ON public.stock_inbound_shipments USING btree (invoice_date);


--
-- Name: idx_stock_inbound_shipments_payment_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stock_inbound_shipments_payment_status ON public.stock_inbound_shipments USING btree (payment_status);


--
-- Name: idx_stock_inbound_shipments_po_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stock_inbound_shipments_po_id ON public.stock_inbound_shipments USING btree (purchase_order_id);


--
-- Name: idx_stock_inbound_shipments_salesperson_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stock_inbound_shipments_salesperson_id ON public.stock_inbound_shipments USING btree (salesperson_id);


--
-- Name: idx_stock_inbound_shipments_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stock_inbound_shipments_status ON public.stock_inbound_shipments USING btree (status);


--
-- Name: idx_stock_inbound_shipments_supplier_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stock_inbound_shipments_supplier_id ON public.stock_inbound_shipments USING btree (supplier_id);


--
-- Name: idx_stock_inbound_shipments_trip_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stock_inbound_shipments_trip_id ON public.stock_inbound_shipments USING btree (trip_id);


--
-- Name: idx_stock_inbound_trips_plate_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stock_inbound_trips_plate_date ON public.stock_inbound_trips USING btree (plate_key, arrival_date);


--
-- Name: idx_stock_inventory_lots_condition; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stock_inventory_lots_condition ON public.stock_inventory_lots USING btree (tile_condition);


--
-- Name: idx_stock_inventory_lots_item_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stock_inventory_lots_item_id ON public.stock_inventory_lots USING btree (item_id);


--
-- Name: idx_stock_inventory_lots_location_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stock_inventory_lots_location_id ON public.stock_inventory_lots USING btree (location_id);


--
-- Name: idx_stock_items_brand_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stock_items_brand_id ON public.stock_items USING btree (brand_id);


--
-- Name: idx_stock_items_current_sqft; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stock_items_current_sqft ON public.stock_items USING btree (current_sqft);


--
-- Name: idx_stock_items_department; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stock_items_department ON public.stock_items USING btree (department);


--
-- Name: idx_stock_items_division_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stock_items_division_id ON public.stock_items USING btree (division_id);


--
-- Name: idx_stock_items_is_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stock_items_is_active ON public.stock_items USING btree (is_active) WHERE (is_active = true);


--
-- Name: idx_stock_items_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stock_items_name ON public.stock_items USING btree (name);


--
-- Name: idx_stock_items_size_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stock_items_size_id ON public.stock_items USING btree (size_id);


--
-- Name: idx_stock_items_sku; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stock_items_sku ON public.stock_items USING btree (sku);


--
-- Name: idx_stock_items_type_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stock_items_type_id ON public.stock_items USING btree (type_id);


--
-- Name: idx_stock_movements_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stock_movements_created_at ON public.stock_movements USING btree (created_at DESC);


--
-- Name: idx_stock_movements_direction; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stock_movements_direction ON public.stock_movements USING btree (direction);


--
-- Name: idx_stock_movements_item_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stock_movements_item_id ON public.stock_movements USING btree (item_id);


--
-- Name: idx_stock_movements_location_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stock_movements_location_created ON public.stock_movements USING btree (location_id, created_at DESC);


--
-- Name: idx_stock_movements_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stock_movements_type ON public.stock_movements USING btree (movement_type);


--
-- Name: idx_stock_notifications_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stock_notifications_created_at ON public.stock_notifications USING btree (created_at DESC);


--
-- Name: idx_stock_notifications_event_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stock_notifications_event_type ON public.stock_notifications USING btree (event_type);


--
-- Name: idx_stock_notifications_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stock_notifications_status ON public.stock_notifications USING btree (status);


--
-- Name: idx_stock_outbound_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stock_outbound_created_at ON public.stock_outbound_shipments USING btree (created_at DESC);


--
-- Name: idx_stock_outbound_items_item_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stock_outbound_items_item_id ON public.stock_outbound_shipment_items USING btree (item_id);


--
-- Name: idx_stock_outbound_items_shipment_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stock_outbound_items_shipment_id ON public.stock_outbound_shipment_items USING btree (outbound_shipment_id);


--
-- Name: idx_stock_outbound_shipment_items_item_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stock_outbound_shipment_items_item_id ON public.stock_outbound_shipment_items USING btree (item_id);


--
-- Name: idx_stock_outbound_shipment_items_shipment_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stock_outbound_shipment_items_shipment_id ON public.stock_outbound_shipment_items USING btree (outbound_shipment_id);


--
-- Name: idx_stock_outbound_shipments_customer_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stock_outbound_shipments_customer_id ON public.stock_outbound_shipments USING btree (customer_id);


--
-- Name: idx_stock_outbound_shipments_order_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stock_outbound_shipments_order_id ON public.stock_outbound_shipments USING btree (sales_order_id);


--
-- Name: idx_stock_outbound_shipments_payment_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stock_outbound_shipments_payment_status ON public.stock_outbound_shipments USING btree (payment_status);


--
-- Name: idx_stock_outbound_shipments_salesperson_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stock_outbound_shipments_salesperson_id ON public.stock_outbound_shipments USING btree (salesperson_id);


--
-- Name: idx_stock_outbound_shipments_salesperson_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stock_outbound_shipments_salesperson_user_id ON public.stock_outbound_shipments USING btree (salesperson_user_id);


--
-- Name: idx_stock_outbound_shipments_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stock_outbound_shipments_status ON public.stock_outbound_shipments USING btree (status);


--
-- Name: idx_stock_purchase_orders_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stock_purchase_orders_status ON public.stock_purchase_orders USING btree (status);


--
-- Name: idx_stock_purchase_orders_supplier_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stock_purchase_orders_supplier_id ON public.stock_purchase_orders USING btree (supplier_id);


--
-- Name: idx_stock_sales_orders_customer_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stock_sales_orders_customer_id ON public.stock_sales_orders USING btree (customer_id);


--
-- Name: idx_stock_sales_orders_salesperson_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stock_sales_orders_salesperson_id ON public.stock_sales_orders USING btree (salesperson_id);


--
-- Name: idx_stock_sales_orders_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stock_sales_orders_status ON public.stock_sales_orders USING btree (status);


--
-- Name: idx_stock_sales_people_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stock_sales_people_name ON public.stock_sales_people USING btree (name);


--
-- Name: idx_stock_sizes_label; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stock_sizes_label ON public.stock_sizes USING btree (label);


--
-- Name: idx_stock_timeline_events_entity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stock_timeline_events_entity ON public.stock_timeline_events USING btree (entity_type, entity_id);


--
-- Name: idx_stock_timeline_events_occurred_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stock_timeline_events_occurred_at ON public.stock_timeline_events USING btree (occurred_at DESC);


--
-- Name: idx_stock_timeline_events_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stock_timeline_events_type ON public.stock_timeline_events USING btree (event_type);


--
-- Name: idx_stock_types_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stock_types_name ON public.stock_types USING btree (name);


--
-- Name: session_userId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "session_userId_idx" ON public.session USING btree ("userId");


--
-- Name: uq_acc_ledgers_customer; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_acc_ledgers_customer ON public.acc_ledgers USING btree (business_id, customer_id) WHERE (customer_id IS NOT NULL);


--
-- Name: uq_acc_ledgers_name; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_acc_ledgers_name ON public.acc_ledgers USING btree (business_id, lower(name));


--
-- Name: uq_acc_ledgers_supplier; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_acc_ledgers_supplier ON public.acc_ledgers USING btree (business_id, supplier_id) WHERE (supplier_id IS NOT NULL);


--
-- Name: uq_acc_ledgers_system; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_acc_ledgers_system ON public.acc_ledgers USING btree (business_id, system_key) WHERE (system_key IS NOT NULL);


--
-- Name: uq_acc_ledgers_transporter; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_acc_ledgers_transporter ON public.acc_ledgers USING btree (business_id, transporter_id) WHERE (transporter_id IS NOT NULL);


--
-- Name: uq_acc_vouchers_source; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_acc_vouchers_source ON public.acc_vouchers USING btree (source_table, source_id, voucher_type) WHERE ((source_table IS NOT NULL) AND (status <> 'cancelled'::text));


--
-- Name: uq_businesses_invoice_prefix; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_businesses_invoice_prefix ON public.stock_businesses USING btree (invoice_prefix);


--
-- Name: uq_outbound_live_sales_invoice; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_outbound_live_sales_invoice ON public.stock_outbound_shipments USING btree (sales_invoice_id) WHERE ((sales_invoice_id IS NOT NULL) AND (approval_status <> 'rejected'::text));


--
-- Name: verification_identifier_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX verification_identifier_idx ON public.verification USING btree (identifier);


--
-- Name: acc_vouchers trg_acc_guard_voucher; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_acc_guard_voucher BEFORE INSERT OR DELETE OR UPDATE ON public.acc_vouchers FOR EACH ROW EXECUTE FUNCTION public.acc_guard_voucher();


--
-- Name: acc_voucher_lines trg_acc_guard_voucher_line; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_acc_guard_voucher_line BEFORE INSERT OR DELETE OR UPDATE ON public.acc_voucher_lines FOR EACH ROW EXECUTE FUNCTION public.acc_guard_voucher_line();


--
-- Name: acc_voucher_lines trg_acc_voucher_balance; Type: TRIGGER; Schema: public; Owner: -
--

CREATE CONSTRAINT TRIGGER trg_acc_voucher_balance AFTER INSERT OR DELETE OR UPDATE ON public.acc_voucher_lines DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.acc_check_voucher_balance();


--
-- Name: acc_ledgers trg_audit_acc_ledgers; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit_acc_ledgers AFTER INSERT OR DELETE OR UPDATE ON public.acc_ledgers FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();


--
-- Name: acc_voucher_lines trg_audit_acc_voucher_lines; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit_acc_voucher_lines AFTER INSERT OR DELETE OR UPDATE ON public.acc_voucher_lines FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();


--
-- Name: acc_vouchers trg_audit_acc_vouchers; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit_acc_vouchers AFTER INSERT OR DELETE OR UPDATE ON public.acc_vouchers FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();


--
-- Name: stock_businesses trg_audit_stock_businesses; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit_stock_businesses AFTER INSERT OR DELETE OR UPDATE ON public.stock_businesses FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();


--
-- Name: stock_inbound_shipments trg_audit_stock_inbound_shipments; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit_stock_inbound_shipments AFTER INSERT OR DELETE OR UPDATE ON public.stock_inbound_shipments FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();


--
-- Name: stock_outbound_shipments trg_audit_stock_outbound_shipments; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit_stock_outbound_shipments AFTER INSERT OR DELETE OR UPDATE ON public.stock_outbound_shipments FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();


--
-- Name: stock_sales_invoices trg_audit_stock_sales_invoices; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit_stock_sales_invoices AFTER INSERT OR DELETE OR UPDATE ON public.stock_sales_invoices FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();


--
-- Name: acc_fiscal_years acc_fiscal_years_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.acc_fiscal_years
    ADD CONSTRAINT acc_fiscal_years_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.stock_businesses(id);


--
-- Name: acc_fiscal_years acc_fiscal_years_locked_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.acc_fiscal_years
    ADD CONSTRAINT acc_fiscal_years_locked_by_user_id_fkey FOREIGN KEY (locked_by_user_id) REFERENCES public.stock_app_users(id);


--
-- Name: acc_ledgers acc_ledgers_app_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.acc_ledgers
    ADD CONSTRAINT acc_ledgers_app_user_id_fkey FOREIGN KEY (app_user_id) REFERENCES public.stock_app_users(id);


--
-- Name: acc_ledgers acc_ledgers_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.acc_ledgers
    ADD CONSTRAINT acc_ledgers_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.stock_businesses(id);


--
-- Name: acc_ledgers acc_ledgers_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.acc_ledgers
    ADD CONSTRAINT acc_ledgers_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.stock_customers(id);


--
-- Name: acc_ledgers acc_ledgers_supplier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.acc_ledgers
    ADD CONSTRAINT acc_ledgers_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.stock_suppliers(id);


--
-- Name: acc_ledgers acc_ledgers_transporter_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.acc_ledgers
    ADD CONSTRAINT acc_ledgers_transporter_id_fkey FOREIGN KEY (transporter_id) REFERENCES public.stock_transporters(id);


--
-- Name: acc_voucher_lines acc_voucher_lines_ledger_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.acc_voucher_lines
    ADD CONSTRAINT acc_voucher_lines_ledger_id_fkey FOREIGN KEY (ledger_id) REFERENCES public.acc_ledgers(id);


--
-- Name: acc_voucher_lines acc_voucher_lines_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.acc_voucher_lines
    ADD CONSTRAINT acc_voucher_lines_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.stock_locations(id);


--
-- Name: acc_voucher_lines acc_voucher_lines_voucher_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.acc_voucher_lines
    ADD CONSTRAINT acc_voucher_lines_voucher_id_fkey FOREIGN KEY (voucher_id) REFERENCES public.acc_vouchers(id) ON DELETE CASCADE;


--
-- Name: acc_vouchers acc_vouchers_approved_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.acc_vouchers
    ADD CONSTRAINT acc_vouchers_approved_by_user_id_fkey FOREIGN KEY (approved_by_user_id) REFERENCES public.stock_app_users(id);


--
-- Name: acc_vouchers acc_vouchers_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.acc_vouchers
    ADD CONSTRAINT acc_vouchers_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.stock_businesses(id);


--
-- Name: acc_vouchers acc_vouchers_cancelled_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.acc_vouchers
    ADD CONSTRAINT acc_vouchers_cancelled_by_user_id_fkey FOREIGN KEY (cancelled_by_user_id) REFERENCES public.stock_app_users(id);


--
-- Name: acc_vouchers acc_vouchers_created_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.acc_vouchers
    ADD CONSTRAINT acc_vouchers_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.stock_app_users(id);


--
-- Name: acc_vouchers acc_vouchers_party_ledger_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.acc_vouchers
    ADD CONSTRAINT acc_vouchers_party_ledger_id_fkey FOREIGN KEY (party_ledger_id) REFERENCES public.acc_ledgers(id);


--
-- Name: account account_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.account
    ADD CONSTRAINT "account_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: session session_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session
    ADD CONSTRAINT "session_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: stock_app_users stock_app_users_default_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_app_users
    ADD CONSTRAINT stock_app_users_default_location_id_fkey FOREIGN KEY (default_location_id) REFERENCES public.stock_locations(id) ON DELETE SET NULL;


--
-- Name: stock_app_users stock_app_users_division_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_app_users
    ADD CONSTRAINT stock_app_users_division_id_fkey FOREIGN KEY (division_id) REFERENCES public.stock_divisions(id);


--
-- Name: stock_attendance_entries stock_attendance_entries_edited_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_attendance_entries
    ADD CONSTRAINT stock_attendance_entries_edited_by_fkey FOREIGN KEY (edited_by) REFERENCES public.stock_app_users(id);


--
-- Name: stock_attendance_entries stock_attendance_entries_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_attendance_entries
    ADD CONSTRAINT stock_attendance_entries_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.stock_locations(id);


--
-- Name: stock_attendance_entries stock_attendance_entries_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_attendance_entries
    ADD CONSTRAINT stock_attendance_entries_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.stock_app_users(id) ON DELETE CASCADE;


--
-- Name: stock_attendance_settings stock_attendance_settings_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_attendance_settings
    ADD CONSTRAINT stock_attendance_settings_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.stock_app_users(id);


--
-- Name: stock_change_requests stock_change_requests_approved_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_change_requests
    ADD CONSTRAINT stock_change_requests_approved_by_user_id_fkey FOREIGN KEY (approved_by_user_id) REFERENCES public.stock_app_users(id);


--
-- Name: stock_change_requests stock_change_requests_implemented_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_change_requests
    ADD CONSTRAINT stock_change_requests_implemented_by_user_id_fkey FOREIGN KEY (implemented_by_user_id) REFERENCES public.stock_app_users(id);


--
-- Name: stock_change_requests stock_change_requests_requested_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_change_requests
    ADD CONSTRAINT stock_change_requests_requested_by_user_id_fkey FOREIGN KEY (requested_by_user_id) REFERENCES public.stock_app_users(id);


--
-- Name: stock_change_requests stock_change_requests_reviewed_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_change_requests
    ADD CONSTRAINT stock_change_requests_reviewed_by_user_id_fkey FOREIGN KEY (reviewed_by_user_id) REFERENCES public.stock_app_users(id);


--
-- Name: stock_customer_acknowledgements stock_customer_acknowledgements_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_customer_acknowledgements
    ADD CONSTRAINT stock_customer_acknowledgements_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.stock_customers(id);


--
-- Name: stock_customer_acknowledgements stock_customer_acknowledgements_outbound_shipment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_customer_acknowledgements
    ADD CONSTRAINT stock_customer_acknowledgements_outbound_shipment_id_fkey FOREIGN KEY (outbound_shipment_id) REFERENCES public.stock_outbound_shipments(id) ON DELETE CASCADE;


--
-- Name: stock_holidays stock_holidays_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_holidays
    ADD CONSTRAINT stock_holidays_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.stock_app_users(id);


--
-- Name: stock_inbound_shipment_items stock_inbound_shipment_items_inbound_shipment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_inbound_shipment_items
    ADD CONSTRAINT stock_inbound_shipment_items_inbound_shipment_id_fkey FOREIGN KEY (inbound_shipment_id) REFERENCES public.stock_inbound_shipments(id) ON DELETE CASCADE;


--
-- Name: stock_inbound_shipment_items stock_inbound_shipment_items_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_inbound_shipment_items
    ADD CONSTRAINT stock_inbound_shipment_items_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.stock_items(id);


--
-- Name: stock_inbound_shipments stock_inbound_shipments_approved_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_inbound_shipments
    ADD CONSTRAINT stock_inbound_shipments_approved_by_user_id_fkey FOREIGN KEY (approved_by_user_id) REFERENCES public.stock_app_users(id);


--
-- Name: stock_inbound_shipments stock_inbound_shipments_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_inbound_shipments
    ADD CONSTRAINT stock_inbound_shipments_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.stock_customers(id);


--
-- Name: stock_inbound_shipments stock_inbound_shipments_destination_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_inbound_shipments
    ADD CONSTRAINT stock_inbound_shipments_destination_location_id_fkey FOREIGN KEY (destination_location_id) REFERENCES public.stock_locations(id);


--
-- Name: stock_inbound_shipments stock_inbound_shipments_locked_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_inbound_shipments
    ADD CONSTRAINT stock_inbound_shipments_locked_by_user_id_fkey FOREIGN KEY (locked_by_user_id) REFERENCES public.stock_app_users(id);


--
-- Name: stock_inbound_shipments stock_inbound_shipments_purchase_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_inbound_shipments
    ADD CONSTRAINT stock_inbound_shipments_purchase_order_id_fkey FOREIGN KEY (purchase_order_id) REFERENCES public.stock_purchase_orders(id);


--
-- Name: stock_inbound_shipments stock_inbound_shipments_recorded_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_inbound_shipments
    ADD CONSTRAINT stock_inbound_shipments_recorded_by_user_id_fkey FOREIGN KEY (recorded_by_user_id) REFERENCES public.stock_app_users(id);


--
-- Name: stock_inbound_shipments stock_inbound_shipments_reviewed_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_inbound_shipments
    ADD CONSTRAINT stock_inbound_shipments_reviewed_by_user_id_fkey FOREIGN KEY (reviewed_by_user_id) REFERENCES public.stock_app_users(id);


--
-- Name: stock_inbound_shipments stock_inbound_shipments_salesperson_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_inbound_shipments
    ADD CONSTRAINT stock_inbound_shipments_salesperson_id_fkey FOREIGN KEY (salesperson_id) REFERENCES public.stock_sales_people(id);


--
-- Name: stock_inbound_shipments stock_inbound_shipments_submitted_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_inbound_shipments
    ADD CONSTRAINT stock_inbound_shipments_submitted_by_user_id_fkey FOREIGN KEY (submitted_by_user_id) REFERENCES public.stock_app_users(id);


--
-- Name: stock_inbound_shipments stock_inbound_shipments_supplier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_inbound_shipments
    ADD CONSTRAINT stock_inbound_shipments_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.stock_suppliers(id);


--
-- Name: stock_inbound_shipments stock_inbound_shipments_transporter_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_inbound_shipments
    ADD CONSTRAINT stock_inbound_shipments_transporter_id_fkey FOREIGN KEY (transporter_id) REFERENCES public.stock_transporters(id);


--
-- Name: stock_inbound_shipments stock_inbound_shipments_trip_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_inbound_shipments
    ADD CONSTRAINT stock_inbound_shipments_trip_id_fkey FOREIGN KEY (trip_id) REFERENCES public.stock_inbound_trips(id);


--
-- Name: stock_inbound_shipments stock_inbound_shipments_vehicle_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_inbound_shipments
    ADD CONSTRAINT stock_inbound_shipments_vehicle_id_fkey FOREIGN KEY (vehicle_id) REFERENCES public.stock_vehicles(id);


--
-- Name: stock_inbound_trips stock_inbound_trips_transporter_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_inbound_trips
    ADD CONSTRAINT stock_inbound_trips_transporter_id_fkey FOREIGN KEY (transporter_id) REFERENCES public.stock_transporters(id);


--
-- Name: stock_inventory_lots stock_inventory_lots_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_inventory_lots
    ADD CONSTRAINT stock_inventory_lots_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.stock_items(id);


--
-- Name: stock_inventory_lots stock_inventory_lots_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_inventory_lots
    ADD CONSTRAINT stock_inventory_lots_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.stock_locations(id);


--
-- Name: stock_items stock_items_brand_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_items
    ADD CONSTRAINT stock_items_brand_id_fkey FOREIGN KEY (brand_id) REFERENCES public.stock_brands(id);


--
-- Name: stock_items stock_items_division_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_items
    ADD CONSTRAINT stock_items_division_id_fkey FOREIGN KEY (division_id) REFERENCES public.stock_divisions(id);


--
-- Name: stock_items stock_items_size_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_items
    ADD CONSTRAINT stock_items_size_id_fkey FOREIGN KEY (size_id) REFERENCES public.stock_sizes(id);


--
-- Name: stock_items stock_items_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_items
    ADD CONSTRAINT stock_items_type_id_fkey FOREIGN KEY (type_id) REFERENCES public.stock_types(id);


--
-- Name: stock_kiosk_devices stock_kiosk_devices_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_kiosk_devices
    ADD CONSTRAINT stock_kiosk_devices_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.stock_app_users(id);


--
-- Name: stock_kiosk_devices stock_kiosk_devices_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_kiosk_devices
    ADD CONSTRAINT stock_kiosk_devices_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.stock_locations(id);


--
-- Name: stock_leave_requests stock_leave_requests_decided_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_leave_requests
    ADD CONSTRAINT stock_leave_requests_decided_by_fkey FOREIGN KEY (decided_by) REFERENCES public.stock_app_users(id);


--
-- Name: stock_leave_requests stock_leave_requests_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_leave_requests
    ADD CONSTRAINT stock_leave_requests_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.stock_app_users(id) ON DELETE CASCADE;


--
-- Name: stock_locations stock_locations_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_locations
    ADD CONSTRAINT stock_locations_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.stock_businesses(id);


--
-- Name: stock_movements stock_movements_inventory_lot_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_movements
    ADD CONSTRAINT stock_movements_inventory_lot_id_fkey FOREIGN KEY (inventory_lot_id) REFERENCES public.stock_inventory_lots(id);


--
-- Name: stock_movements stock_movements_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_movements
    ADD CONSTRAINT stock_movements_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.stock_items(id);


--
-- Name: stock_movements stock_movements_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_movements
    ADD CONSTRAINT stock_movements_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.stock_locations(id);


--
-- Name: stock_outbound_shipment_items stock_outbound_shipment_items_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_outbound_shipment_items
    ADD CONSTRAINT stock_outbound_shipment_items_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.stock_items(id);


--
-- Name: stock_outbound_shipment_items stock_outbound_shipment_items_outbound_shipment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_outbound_shipment_items
    ADD CONSTRAINT stock_outbound_shipment_items_outbound_shipment_id_fkey FOREIGN KEY (outbound_shipment_id) REFERENCES public.stock_outbound_shipments(id) ON DELETE CASCADE;


--
-- Name: stock_outbound_shipments stock_outbound_shipments_approved_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_outbound_shipments
    ADD CONSTRAINT stock_outbound_shipments_approved_by_user_id_fkey FOREIGN KEY (approved_by_user_id) REFERENCES public.stock_app_users(id);


--
-- Name: stock_outbound_shipments stock_outbound_shipments_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_outbound_shipments
    ADD CONSTRAINT stock_outbound_shipments_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.stock_customers(id);


--
-- Name: stock_outbound_shipments stock_outbound_shipments_locked_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_outbound_shipments
    ADD CONSTRAINT stock_outbound_shipments_locked_by_user_id_fkey FOREIGN KEY (locked_by_user_id) REFERENCES public.stock_app_users(id);


--
-- Name: stock_outbound_shipments stock_outbound_shipments_recorded_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_outbound_shipments
    ADD CONSTRAINT stock_outbound_shipments_recorded_by_user_id_fkey FOREIGN KEY (recorded_by_user_id) REFERENCES public.stock_app_users(id);


--
-- Name: stock_outbound_shipments stock_outbound_shipments_reviewed_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_outbound_shipments
    ADD CONSTRAINT stock_outbound_shipments_reviewed_by_user_id_fkey FOREIGN KEY (reviewed_by_user_id) REFERENCES public.stock_app_users(id);


--
-- Name: stock_outbound_shipments stock_outbound_shipments_sales_invoice_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_outbound_shipments
    ADD CONSTRAINT stock_outbound_shipments_sales_invoice_id_fkey FOREIGN KEY (sales_invoice_id) REFERENCES public.stock_sales_invoices(id);


--
-- Name: stock_outbound_shipments stock_outbound_shipments_sales_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_outbound_shipments
    ADD CONSTRAINT stock_outbound_shipments_sales_order_id_fkey FOREIGN KEY (sales_order_id) REFERENCES public.stock_sales_orders(id);


--
-- Name: stock_outbound_shipments stock_outbound_shipments_salesperson_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_outbound_shipments
    ADD CONSTRAINT stock_outbound_shipments_salesperson_id_fkey FOREIGN KEY (salesperson_id) REFERENCES public.stock_sales_people(id);


--
-- Name: stock_outbound_shipments stock_outbound_shipments_salesperson_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_outbound_shipments
    ADD CONSTRAINT stock_outbound_shipments_salesperson_user_id_fkey FOREIGN KEY (salesperson_user_id) REFERENCES public.stock_app_users(id);


--
-- Name: stock_outbound_shipments stock_outbound_shipments_submitted_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_outbound_shipments
    ADD CONSTRAINT stock_outbound_shipments_submitted_by_user_id_fkey FOREIGN KEY (submitted_by_user_id) REFERENCES public.stock_app_users(id);


--
-- Name: stock_outbound_shipments stock_outbound_shipments_vehicle_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_outbound_shipments
    ADD CONSTRAINT stock_outbound_shipments_vehicle_id_fkey FOREIGN KEY (vehicle_id) REFERENCES public.stock_vehicles(id);


--
-- Name: stock_purchase_orders stock_purchase_orders_supplier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_purchase_orders
    ADD CONSTRAINT stock_purchase_orders_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.stock_suppliers(id);


--
-- Name: stock_sales_invoices stock_sales_invoices_approved_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_sales_invoices
    ADD CONSTRAINT stock_sales_invoices_approved_by_user_id_fkey FOREIGN KEY (approved_by_user_id) REFERENCES public.stock_app_users(id);


--
-- Name: stock_sales_invoices stock_sales_invoices_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_sales_invoices
    ADD CONSTRAINT stock_sales_invoices_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.stock_businesses(id);


--
-- Name: stock_sales_invoices stock_sales_invoices_created_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_sales_invoices
    ADD CONSTRAINT stock_sales_invoices_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.stock_app_users(id);


--
-- Name: stock_sales_invoices stock_sales_invoices_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_sales_invoices
    ADD CONSTRAINT stock_sales_invoices_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.stock_customers(id);


--
-- Name: stock_sales_invoices stock_sales_invoices_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_sales_invoices
    ADD CONSTRAINT stock_sales_invoices_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.stock_locations(id);


--
-- Name: stock_sales_invoices stock_sales_invoices_salesperson_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_sales_invoices
    ADD CONSTRAINT stock_sales_invoices_salesperson_user_id_fkey FOREIGN KEY (salesperson_user_id) REFERENCES public.stock_app_users(id);


--
-- Name: stock_sales_orders stock_sales_orders_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_sales_orders
    ADD CONSTRAINT stock_sales_orders_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.stock_customers(id);


--
-- Name: stock_sales_orders stock_sales_orders_salesperson_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_sales_orders
    ADD CONSTRAINT stock_sales_orders_salesperson_id_fkey FOREIGN KEY (salesperson_id) REFERENCES public.stock_sales_people(id);


--
-- Name: stock_showroom_stock stock_showroom_stock_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_showroom_stock
    ADD CONSTRAINT stock_showroom_stock_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.stock_items(id) ON DELETE CASCADE;


--
-- Name: stock_showroom_stock stock_showroom_stock_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_showroom_stock
    ADD CONSTRAINT stock_showroom_stock_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.stock_locations(id);


--
-- Name: stock_timeline_events stock_timeline_events_recorded_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_timeline_events
    ADD CONSTRAINT stock_timeline_events_recorded_by_user_id_fkey FOREIGN KEY (recorded_by_user_id) REFERENCES public.stock_app_users(id);


--
-- Name: stock_user_divisions stock_user_divisions_division_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_user_divisions
    ADD CONSTRAINT stock_user_divisions_division_id_fkey FOREIGN KEY (division_id) REFERENCES public.stock_divisions(id) ON DELETE CASCADE;


--
-- Name: stock_user_divisions stock_user_divisions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_user_divisions
    ADD CONSTRAINT stock_user_divisions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.stock_app_users(id) ON DELETE CASCADE;


--
-- Name: stock_vehicles stock_vehicles_transporter_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_vehicles
    ADD CONSTRAINT stock_vehicles_transporter_id_fkey FOREIGN KEY (transporter_id) REFERENCES public.stock_transporters(id);


--
-- PostgreSQL database dump complete
--


