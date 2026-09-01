/** Menggabungkan seluruh bab menjadi satu deretan elemen dokumen */
module.exports = (alat) => [
  ...require('./isi-bagian-1.js')(alat),
  ...require('./isi-bagian-2.js')(alat),
];
