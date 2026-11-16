// PS4 console information — demonstration values only. A later stage reads these from the console.
export default {
  id: 'ps4',
  model: 'PS4 Pro',
  firmware: '9.00',
  // `holds`: which platform's games live on the drive; their sizes are added up from the library.
  storage: [
    { name: 'Internal', total: 862, holds: 'ps4', categories: { Applications: 14.8, 'Captures & media': 21.6, 'Saved data': 6.4, System: 29.5 } },
    { name: 'USB0', total: 1863, categories: { Backups: 612.7, 'Captures & media': 98.2, Music: 14.3 } },
  ],
};
