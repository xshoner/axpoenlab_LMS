begin;
create function public.lesson_inline_images() returns jsonb
language sql stable security definer set search_path='' as $$
select coalesce(jsonb_agg(t),'[]'::jsonb) from (
  select 'master_courses' as table_name,id,owner_admin_id as owner,md5(body) as hash,octet_length(body) as bytes from public.master_courses where position('data:image/' in body)>0
  union all
  select 'cohort_courses',c.id,h.owner_admin_id,md5(c.body),octet_length(c.body) from public.cohort_courses c join public.cohorts h on h.id=c.cohort_id where position('data:image/' in c.body)>0
)t
$$;
create function public.replace_lesson_images(p_table text,p_id uuid,p_hash text,p_body text) returns boolean
language plpgsql security definer set search_path='' as $$
declare updated uuid;
begin
  if p_table='master_courses' then
    update public.master_courses set body=p_body where id=p_id and md5(body)=p_hash returning id into updated;
  elsif p_table='cohort_courses' then
    update public.cohort_courses set body=p_body where id=p_id and md5(body)=p_hash returning id into updated;
  else raise exception 'invalid_table'; end if;
  return updated is not null;
end $$;
revoke all on function public.lesson_inline_images(),public.replace_lesson_images(text,uuid,text,text) from public,anon,authenticated;
grant execute on function public.lesson_inline_images(),public.replace_lesson_images(text,uuid,text,text) to service_role;
notify pgrst,'reload schema';
commit;
