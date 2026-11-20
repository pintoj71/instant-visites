// Lu dans <head>, avant tout affichage : arrivée depuis le portail (#ticket=…) → l'écran du code
// reste caché, seul un écran neutre « Ouverture… » est visible pendant l'échange du ticket.
if (/[#&]ticket=[0-9a-f]{48}/.test(location.hash)) document.documentElement.classList.add('entree-portail');
