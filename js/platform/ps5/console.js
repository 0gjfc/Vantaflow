// PS5 console information — demonstration values only. A later stage reads these from the console.
export default {
  id: 'ps5',
  model: 'PS5',
  firmware: '4.03',
  // PS5 titles must run from the internal SSD; PS4 titles can live on USB extended storage.
  storage: [
    { name: 'Internal SSD', total: 667, holds: 'ps5', categories: { Applications: 18.9, 'Captures & media': 34.2, 'Saved data': 9.8, System: 41.3 } },
    { name: 'USB extended storage', total: 1863, holds: 'ps4', categories: { Backups: 120.4 } },
  ],
};
