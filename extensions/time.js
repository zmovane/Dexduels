function delay(ms) {
  return new Promise((cb) => setTimeout(cb, ms));
}

export { delay };
