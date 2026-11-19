-- À exécuter uniquement dans le SQL Editor du projet instant-portail-preprod.
-- Copier le résultat dans PORTAIL_MODULE_CLE sur instant-visites-preprod.
-- Chaque exécution remplace la clé précédente de ce module.
with nouvelle as materialized (
  select encode(extensions.gen_random_bytes(32), 'hex') as valeur
), enregistrement as (
  insert into public.cat_config (cle, valeur)
  select 'secret_visites', public.portail__hash(valeur) from nouvelle
  on conflict (cle) do update set valeur = excluded.valeur
  returning cle
)
select nouvelle.valeur as "PORTAIL_MODULE_CLE"
from nouvelle cross join enregistrement;
