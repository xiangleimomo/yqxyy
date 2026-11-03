do $migration$
declare source text;segment text;revised text;first_pos integer;last_pos integer;
begin
 source:=pg_get_functiondef('sf_medals_private.api(text,jsonb)'::regprocedure);
 first_pos:=strpos(source,'if p_action=''issued'' then');last_pos:=strpos(source,'if p_action=''revoke'' then');
 if first_pos=0 or last_pos<=first_pos then raise exception 'Unexpected issued query';end if;
 segment:=substr(source,first_pos,last_pos-first_pos);
 revised:=replace(replace(replace(replace(segment,'a.','issued_award.'),'t.','issued_template.'),'honor_awards a join','honor_awards issued_award join'),'honor_templates t on','honor_templates issued_template on');
 source:=substr(source,1,first_pos-1)||revised||substr(source,last_pos);
 first_pos:=strpos(source,'elsif p_action=''admin'' then');last_pos:=strpos(source,'elsif p_action=''resolve_report'' then');
 if first_pos=0 or last_pos<=first_pos then raise exception 'Unexpected admin query';end if;
 segment:=substr(source,first_pos,last_pos-first_pos);
 revised:=replace(replace(replace(replace(replace(segment,'r.','catalog_row.'),'t.','review_template.'),'resources r ','resources catalog_row '),'reports r ','reports catalog_row '),'honor_templates t ','honor_templates review_template ');
 source:=substr(source,1,first_pos-1)||revised||substr(source,last_pos);
 execute source;
end $migration$;
