do $migration$
declare source text;
begin
 source:=pg_get_functiondef('sf_medals_private.api(text,jsonb)'::regprocedure);
 source:=replace(source,'''rule'',w.unlock_rule,''mainline''','''rule'',w.unlock_rule,''quiz_min'',w.quiz_min,''mainline''');
 execute source;
end $migration$;
