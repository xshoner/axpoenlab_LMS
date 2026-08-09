-- 선다형: 복수 인정 정답 — 학생이 고른 보기가 정답 집합에 포함되면 정답 처리
create or replace function public.grade_quiz(p_quiz_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_sub record;
  v_q record;
  v_ans record;
  v_correct boolean;
  v_earned numeric;
  v_total numeric;
  v_graded int := 0;
  v_norm_val text;
  v_ok boolean;
  v_selected text[];
  v_answers text[];
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  if exists (
    select 1 from public.quiz_questions
    where quiz_id = p_quiz_id and (answer is null or answer = 'null'::jsonb)
  ) then
    return jsonb_build_object('ok', false, 'error', 'missing_answers');
  end if;

  update public.quizzes set status = 'closed', graded_at = now() where id = p_quiz_id;

  for v_sub in select * from public.quiz_submissions where quiz_id = p_quiz_id loop
    v_total := 0;
    for v_q in select * from public.quiz_questions where quiz_id = p_quiz_id loop
      select * into v_ans from public.quiz_answers
        where submission_id = v_sub.id and question_id = v_q.id;
      v_correct := false;
      if v_ans.id is not null and v_ans.value is not null then
        if v_q.type = 'choice' then
          begin
            select array_agg(x) into v_selected from jsonb_array_elements_text(v_ans.value) as t(x);
            select array_agg(x) into v_answers from jsonb_array_elements_text(v_q.answer) as t(x);
            v_correct := v_selected is not null and array_length(v_selected, 1) > 0
              and v_selected <@ v_answers;
          exception when others then v_correct := false;
          end;
        elsif v_q.type = 'short' then
          v_norm_val := lower(regexp_replace(coalesce(v_ans.value #>> '{}', ''), '\s', '', 'g'));
          v_ok := false;
          begin
            select bool_or(lower(regexp_replace(x, '\s', '', 'g')) = v_norm_val) into v_ok
            from jsonb_array_elements_text(v_q.answer) as t(x);
          exception when others then v_ok := false;
          end;
          v_correct := coalesce(v_ok, false) and v_norm_val <> '';
        elsif v_q.type = 'ox' then
          v_correct := upper(coalesce(v_ans.value #>> '{}', '')) = upper(coalesce(v_q.answer #>> '{}', ''));
        end if;
      end if;
      v_earned := case when v_correct then v_q.points else 0 end;
      v_total := v_total + v_earned;
      if v_ans.id is not null then
        update public.quiz_answers set is_correct = v_correct, earned_score = v_earned where id = v_ans.id;
      else
        insert into public.quiz_answers (submission_id, question_id, value, is_correct, earned_score)
        values (v_sub.id, v_q.id, null, false, 0);
      end if;
    end loop;
    update public.quiz_submissions set total_score = v_total, graded = true where id = v_sub.id;
    v_graded := v_graded + 1;
  end loop;
  return jsonb_build_object('ok', true, 'graded', v_graded);
end $$;
