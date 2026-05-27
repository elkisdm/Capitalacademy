-- =============================================================================
-- Capital Academy — Sistema de Quiz Final + Certificación
-- Pipeline: completitud → quiz → certificado PDF → verificación pública
-- ADR: docs/adr/0007-certificacion-y-quizzes.md
-- =============================================================================

-- Configuración de quiz por programa
create table public.quiz_configs (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs(id) on delete cascade,
  min_completion_pct int not null default 80 check (min_completion_pct between 1 and 100),
  passing_grade_pct int not null default 70 check (passing_grade_pct between 1 and 100),
  questions_per_attempt int not null default 10 check (questions_per_attempt >= 1),
  max_attempts int not null default 3 check (max_attempts >= 1),
  time_limit_minutes int,
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (program_id)
);

create trigger trg_quiz_configs_updated_at
  before update on public.quiz_configs
  for each row execute function public.tg_set_updated_at();

-- Pool de preguntas por programa
create table public.quiz_questions (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs(id) on delete cascade,
  lesson_id uuid references public.lessons(id) on delete set null,
  question_text text not null,
  options jsonb not null,
  correct_option text not null check (correct_option in ('A', 'B', 'C', 'D')),
  explanation text,
  is_generated boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_quiz_questions_updated_at
  before update on public.quiz_questions
  for each row execute function public.tg_set_updated_at();

create index quiz_questions_program_idx on public.quiz_questions(program_id);

-- Intentos de quiz por alumno
create table public.quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references public.enrollments(id) on delete cascade,
  program_id uuid not null references public.programs(id) on delete cascade,
  questions_presented jsonb not null,
  answers jsonb not null default '{}',
  score_pct numeric(5,2),
  passed boolean,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create index quiz_attempts_enrollment_idx on public.quiz_attempts(enrollment_id);
create index quiz_attempts_program_idx on public.quiz_attempts(program_id);

-- Templates de certificado por programa
create table public.certificate_templates (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs(id) on delete cascade,
  template_png_path text not null,
  font_family text not null default 'Allura',
  font_path text not null default 'assets/fonts/Allura-Regular.ttf',
  name_center_x int not null default 1000,
  name_baseline_y int not null default 760,
  default_font_size int not null default 130,
  min_font_size int not null default 70,
  max_name_width int not null default 1100,
  name_color_hex text not null default '#000000',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (program_id)
);

-- Certificados emitidos
create table public.certificates (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references public.enrollments(id) on delete cascade,
  program_id uuid not null references public.programs(id) on delete cascade,
  quiz_attempt_id uuid references public.quiz_attempts(id) on delete set null,
  student_name text not null,
  verification_code text not null unique,
  pdf_storage_path text not null,
  pdf_url text,
  emailed_at timestamptz,
  issued_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (enrollment_id)
);

create index certificates_verification_idx on public.certificates(verification_code);
create index certificates_program_idx on public.certificates(program_id);

-- RLS
alter table public.quiz_configs enable row level security;
alter table public.quiz_questions enable row level security;
alter table public.quiz_attempts enable row level security;
alter table public.certificate_templates enable row level security;
alter table public.certificates enable row level security;

-- quiz_configs: staff todo, alumnos leen config de su programa via cohort→program
create policy quiz_configs_staff_all on public.quiz_configs
  for all using (public.is_platform_staff());

create policy quiz_configs_student_select on public.quiz_configs
  for select using (
    exists (
      select 1 from public.enrollments e
      inner join public.cohorts c on c.id = e.cohort_id
      where e.student_id = auth.uid()
        and c.program_id = quiz_configs.program_id
        and e.status = 'active'
    )
  );

-- quiz_questions: solo staff (alumno accede via API)
create policy quiz_questions_staff_all on public.quiz_questions
  for all using (public.is_platform_staff());

-- quiz_attempts: alumno solo sus propios intentos
create policy quiz_attempts_student_own on public.quiz_attempts
  for all using (
    enrollment_id in (
      select id from public.enrollments where student_id = auth.uid()
    )
  );

create policy quiz_attempts_staff_all on public.quiz_attempts
  for all using (public.is_platform_staff());

-- certificates: alumno solo el suyo
create policy certificates_student_own on public.certificates
  for select using (
    enrollment_id in (
      select id from public.enrollments where student_id = auth.uid()
    )
  );

create policy certificates_staff_all on public.certificates
  for all using (public.is_platform_staff());

-- certificate_templates: solo staff
create policy certificate_templates_staff_all on public.certificate_templates
  for all using (public.is_platform_staff());
