// Lu dans <head>, avant tout affichage : la page d'entrée n'a plus d'écran de code. Que l'on arrive avec
// #ticket=… ou en direct, seul un écran neutre « Ouverture… » est visible pendant que l'appli vérifie
// l'accès (ticket du portail, session déjà ouverte) ou renvoie au portail.
document.documentElement.classList.add('entree-portail');
