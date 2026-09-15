alter table public.arcade_games
  add column developer text not null default '' check (length(developer) <= 100);

create policy "admins update arcade" on public.arcade_games
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admins delete arcade" on public.arcade_games
  for delete to authenticated using (public.is_admin());
grant update, delete on public.arcade_games to authenticated;
