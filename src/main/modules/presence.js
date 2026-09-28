// S'endort quand l'ordinateur n'est plus utilisé (ni souris ni clavier),
// et se réveille dès que tu reviens.
const { powerMonitor } = require('electron');

const SLEEP_AFTER_SECONDS = 180;

const WELCOME_BACK = [
  'Oh ! Te revoilà !',
  'Hmm ? Je ne dormais pas, promis.',
  'Re-bonjour !',
];

module.exports = {
  name: 'presence',
  setup(pet) {
    let asleep = false;

    const timer = setInterval(() => {
      const idle = powerMonitor.getSystemIdleTime();
      if (!asleep && idle >= SLEEP_AFTER_SECONDS) {
        asleep = true;
        pet.sleep();
      } else if (asleep && idle < 2) {
        asleep = false;
        pet.wake();
        pet.say(WELCOME_BACK[Math.floor(Math.random() * WELCOME_BACK.length)], { duration: 3500 });
      }
    }, 1000);

    powerMonitor.on('lock-screen', pet.sleep);

    return () => clearInterval(timer);
  },
};
