SELECT u.id, u.clerk_id, u.email, o.name, o.slug
FROM public.organizations o
JOIN public.users u ON u.id = o.owner_user_id
ORDER BY o.name;

--sacar data de email correcta/utilizable
SELECT * FROM public.users WHERE email = 'kevinpalaciosguzman@gmail.com';

--update organizador
--UPDATE public.users
--SET clerk_id = 'user_3GBREgyrTKj3oF3kTU2H3XOdVTs',
--    email = 'kevinpalaciosguzman@gmail.com'
--WHERE id = '9de95ebd-e3ad-43fa-861a-34f603abfabf';

--delete user
--delete from public.users  WHERE email = 'kevinpalaciosguzman@gmail.com'


--dejar en null id's y permisos para stripe (roto si viene de seed prod a dev)
UPDATE public.organizations
SET stripe_account_id = NULL,
    stripe_charges_enabled = false,
    stripe_payouts_enabled = false;


select * from public.organizations;

select * from public.events order by starts_at;

select * from public.orders_errors;