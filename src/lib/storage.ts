import { nativeStorage } from "zmp-sdk";

export const storage={
  getItem(key:string){try{return nativeStorage.getItem(key)}catch{return window.localStorage.getItem(key)}},
  setItem(key:string,value:string){try{nativeStorage.setItem(key,value)}catch{window.localStorage.setItem(key,value)}},
  removeItem(key:string){try{nativeStorage.removeItem(key)}catch{window.localStorage.removeItem(key)}},
};

export const sessionStorageCompat={
  getItem(key:string){return storage.getItem(`session:${key}`)},
  setItem(key:string,value:string){storage.setItem(`session:${key}`,value)},
  removeItem(key:string){storage.removeItem(`session:${key}`)},
};
