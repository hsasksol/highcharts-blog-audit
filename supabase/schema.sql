-- Highcharts blog audit: run this once in the Supabase SQL editor.

create table if not exists posts (
  id              integer primary key,                 -- WordPress post ID
  url             text not null unique,
  slug            text not null,
  title           text not null,
  author_name     text,                                 -- display name (from page JSON-LD)
  author_slug     text,                                 -- co-authors term slug (stable filter key)
  category        text,
  tags            text[] default '{}',
  published_at    timestamptz,
  modified_at     timestamptz,
  word_count      integer default 0,
  original_html   text not null,                        -- WP content.rendered, nothing from the template
  original_text   text,
  fetched_at      timestamptz default now(),

  -- audit output
  audit_status    text not null default 'pending',      -- pending | running | audited | error
  audit_error     text,
  audited_at      timestamptz,
  summary         text,
  overall_severity text,                                -- ok | minor | major | blocker
  historical      boolean default false,
  aeo_score       integer,
  suggested_html  text,                                 -- full LLM rewrite
  aeo             jsonb,                                -- { lead_answer, suggested_headings, faq, schema_jsonld }

  -- age warning box (reviewer toggles it; inserted at top of final_html)
  age_warning     boolean not null default false,
  age_warning_text text,

  -- review state
  state           text not null default 'pending',      -- pending | in-review | approved | needs-changes | rejected
  state_override  text,                                 -- manual override of the computed state
  final_html      text,                                 -- original with accepted changes applied (copy into WordPress)
  final_updated_at timestamptz
);

create index if not exists posts_author_idx on posts (author_slug);
create index if not exists posts_state_idx on posts (state);
create index if not exists posts_published_idx on posts (published_at desc);

create table if not exists issues (
  id                uuid primary key default gen_random_uuid(),
  post_id           integer not null references posts(id) on delete cascade,
  source            text not null,                      -- rule | llm
  axis              smallint not null,                  -- 1 technical, 2 structure, 3 content, 4 aeo
  category          text not null,
  severity          text not null,                      -- info | minor | major | blocker
  title             text not null,
  description       text,
  original_snippet  text,                               -- exact substring of original_html, or null
  suggested_snippet text,                               -- replacement / insertion, or null
  apply_mode        text not null default 'replace',    -- replace | prepend | append | none
  sort_order        integer default 0,
  decision          text not null default 'pending',    -- pending | accepted | rejected | needs-changes
  note              text,
  decided_by        text,
  decided_at        timestamptz,
  created_at        timestamptz default now()
);

create index if not exists issues_post_idx on issues (post_id);
create index if not exists issues_decision_idx on issues (decision);

create table if not exists decision_log (
  id          bigserial primary key,
  post_id     integer not null,
  issue_id    uuid,
  action      text not null,                            -- accepted | rejected | needs-changes | reopened | state-override | ...
  actor       text,
  note        text,
  created_at  timestamptz default now()
);

create index if not exists decision_log_post_idx on decision_log (post_id);

-- The app uses the service role key server-side only; keep RLS on so the anon key is useless.
alter table posts enable row level security;
alter table issues enable row level security;
alter table decision_log enable row level security;
