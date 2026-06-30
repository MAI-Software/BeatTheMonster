// Vite worker imports (`./foo?worker`) resolve to a Worker constructor.
declare module "*?worker" {
  const workerConstructor: new () => Worker;
  export default workerConstructor;
}
