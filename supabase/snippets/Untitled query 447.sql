select 'orders' t, event_id::text id, count(*) n from orders group by event_id having count(*) > 1000
union all
select 'rsvps', event_id::text, count(*) from rsvps group by event_id having count(*) > 1000
union all
select 'orders_promotor_org', e.organization_id::text, count(*) from orders o join events e on e.id = o.event_id
  where o.promoter_code is not null group by e.organization_id having count(*) > 1000;