function chunk(lst, size) {
  let chunks = [];
  for (let i = 0; i < lst.length; i += size)
    chunks.push(lst.slice(i, i + size));
  return chunks;
}

function genCombinations(lst) {
  return lst.flatMap((base, i) =>
    lst.slice(i + 1).map((other) => [base, other])
  );
}

export { chunk, genCombinations };
