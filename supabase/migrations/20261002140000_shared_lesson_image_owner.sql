begin;
create or replace function public.lesson_inline_images() returns jsonb
language sql stable security definer set search_path='' as $$
with fallback as (select id from public.profiles where role='super_admin' and status='active' order by created_at,id limit 1)
select coalesce(jsonb_agg(t),'[]'::jsonb) from (
  select 'master_courses' as table_name,id,coalesce(owner_admin_id,(select id from fallback)) as owner,md5(body) as hash,octet_length(body) as bytes from public.master_courses where position('data:image/' in body)>0
  union all
  select 'cohort_courses',c.id,coalesce(h.owner_admin_id,(select id from fallback)),md5(c.body),octet_length(c.body) from public.cohort_courses c join public.cohorts h on h.id=c.cohort_id where position('data:image/' in c.body)>0
)t
$$;
notify pgrst,'reload schema';
commit;
