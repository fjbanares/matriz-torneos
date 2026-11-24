// Diferencia media de puntos -> valor de la escala 1-7 de la matriz
function scoreFromAvgDiff(d) {
  if (d === null || d === undefined || Number.isNaN(Number(d))) return null;
  d = Number(d);
  if (d <= -41) return 1;
  if (d <= -26) return 2;
  if (d <= -11) return 3;
  if (d <= 10) return 4;
  if (d <= 25) return 5;
  if (d <= 40) return 6;
  return 7;
}
module.exports = { scoreFromAvgDiff };
