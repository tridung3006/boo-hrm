export const isZaloMiniApp=()=>/Zalo/i.test(navigator.userAgent)||typeof (window as Window & {ZJSBridge?:unknown}).ZJSBridge!=="undefined";
