/**
 * Penyimpan data per-permintaan berbasis AsyncLocalStorage.
 *
 * Masalah yang dipecahkan: requestId dibuat di middleware, tetapi yang perlu
 * mencantumkannya di log adalah service dan repository — beberapa lapisan di
 * bawah. Meneruskannya lewat argumen berarti menambah parameter ke SETIAP
 * method di sepanjang rantai, hanya untuk keperluan log.
 *
 * AsyncLocalStorage (bawaan node:async_hooks) menyimpannya di luar rantai
 * argumen dan tetap terbawa melewati await, jadi tanda tangan method tidak
 * perlu berubah sama sekali.
 *
 * Kenapa bukan variabel global biasa: Node melayani banyak permintaan secara
 * bersamaan dalam satu proses. Variabel global akan tertimpa oleh permintaan
 * berikutnya di tengah await, dan log satu permintaan bercampur dengan
 * requestId permintaan lain.
 */
const { AsyncLocalStorage } = require('node:async_hooks');

class RequestContext {
  #storage = new AsyncLocalStorage();

  /** Menjalankan callback dengan store yang hanya berlaku di dalamnya. */
  run(store, callback) {
    return this.#storage.run(store, callback);
  }

  get store() {
    return this.#storage.getStore() ?? null;
  }

  /** null di luar siklus permintaan — misalnya saat start atau di worker. */
  get requestId() {
    return this.store?.requestId ?? null;
  }

  /**
   * Menambah keterangan ke store yang sedang berjalan.
   *
   * Dipakai middleware autentikasi untuk menitipkan identitas pelaku, supaya
   * jejak audit dan log tahu siapa yang bertindak tanpa perlu meneruskannya
   * lewat argumen ke setiap lapisan di bawahnya.
   *
   * Di luar siklus permintaan ia tidak melakukan apa pun — bukan melempar.
   * Service yang sama juga dipanggil seeder, dan seeder tidak punya store.
   */
  set(fields) {
    const store = this.store;

    if (store) {
      Object.assign(store, fields);
    }
  }
}

module.exports = { RequestContext };
