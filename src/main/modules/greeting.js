// Dit bonjour au démarrage selon l'heure de la journée.
function greetingFor(hour) {
  if (hour < 5) return 'Encore debout ? Moi je baille déjà...';
  if (hour < 12) return 'Bonjour ! Prêt pour la journée ?';
  if (hour < 14) return 'Bon appétit !';
  if (hour < 18) return 'Coucou ! Je suis là si besoin.';
  if (hour < 22) return 'Bonsoir !';
  return 'Il se fait tard... on travaille encore ?';
}

module.exports = {
  name: 'greeting',
  setup(pet) {
    pet.bus.once('ready', () => {
      setTimeout(() => {
        pet.play('hop');
        pet.say(greetingFor(new Date().getHours()), { duration: 5000 });
      }, 1200);
    });
  },
};
