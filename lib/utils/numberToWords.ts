/**
 * Converts a numeric amount to Indian Currency words (e.g. FIFTY NINE THOUSAND NINE HUNDRED TWENTY TWO RUPEES ONLY)
 */
export function numberToIndianRupeesWords(amount: number): string {
  if (isNaN(amount) || amount === 0) return "ZERO RUPEES ONLY";

  const isNegative = amount < 0;
  const absAmount = Math.abs(amount);
  const rupees = Math.floor(absAmount);
  const paise = Math.round((absAmount - rupees) * 100);

  const units = ["", "ONE", "TWO", "THREE", "FOUR", "FIVE", "SIX", "SEVEN", "EIGHT", "NINE", "TEN", "ELEVEN", "TWELVE", "THIRTEEN", "FOURTEEN", "FIFTEEN", "SIXTEEN", "SEVENTEEN", "EIGHTEEN", "NINETEEN"];
  const tens = ["", "", "TWENTY", "THIRTY", "FORTY", "FIFTY", "SIXTY", "SEVENTY", "EIGHTY", "NINETY"];

  function convertTwoDigits(n: number): string {
    if (n < 20) return units[n];
    const t = Math.floor(n / 10);
    const u = n % 10;
    return tens[t] + (u > 0 ? " " + units[u] : "");
  }

  function convertThreeDigits(n: number): string {
    const h = Math.floor(n / 100);
    const rest = n % 100;
    let res = "";
    if (h > 0) res += units[h] + " HUNDRED";
    if (rest > 0) res += (res ? " " : "") + convertTwoDigits(rest);
    return res;
  }

  function convertToIndianWords(num: number): string {
    if (num === 0) return "";
    let str = "";

    // Crores (>= 1,00,00,000)
    const crores = Math.floor(num / 10000000);
    let rem = num % 10000000;
    if (crores > 0) {
      str += convertToIndianWords(crores) + " CRORE ";
    }

    // Lakhs (>= 1,00,000)
    const lakhs = Math.floor(rem / 100000);
    rem = rem % 100000;
    if (lakhs > 0) {
      str += convertTwoDigits(lakhs) + " LAKH ";
    }

    // Thousands (>= 1,000)
    const thousands = Math.floor(rem / 1000);
    rem = rem % 1000;
    if (thousands > 0) {
      str += convertTwoDigits(thousands) + " THOUSAND ";
    }

    // Hundreds and remaining
    if (rem > 0) {
      str += convertThreeDigits(rem);
    }

    return str.trim();
  }

  let words = convertToIndianWords(rupees);
  if (!words) words = "ZERO";

  let result = (isNegative ? "MINUS " : "") + words + " RUPEES";
  if (paise > 0) {
    result += " AND " + convertTwoDigits(paise) + " PAISE";
  }
  result += " ONLY";

  return result.toUpperCase();
}
