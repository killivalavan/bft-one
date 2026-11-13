export interface CurrencyOption {
  symbol: string;
  code: string;
  country: string;
  name: string;
}

export const CURRENCY_OPTIONS: CurrencyOption[] = [
  { symbol: "₹", code: "INR", country: "India", name: "Indian Rupee" },
  { symbol: "$", code: "USD", country: "United States", name: "US Dollar" },
  { symbol: "د.إ", code: "AED", country: "United Arab Emirates", name: "UAE Dirham" },
  { symbol: "£", code: "GBP", country: "United Kingdom", name: "British Pound" },
  { symbol: "€", code: "EUR", country: "Eurozone", name: "Euro" },
  { symbol: "S$", code: "SGD", country: "Singapore", name: "Singapore Dollar" },
  { symbol: "RM", code: "MYR", country: "Malaysia", name: "Malaysian Ringgit" },
  { symbol: "﷼", code: "SAR", country: "Saudi Arabia", name: "Saudi Riyal" },
  { symbol: "QR", code: "QAR", country: "Qatar", name: "Qatari Riyal" },
  { symbol: "KD", code: "KWD", country: "Kuwait", name: "Kuwaiti Dinar" },
  { symbol: "BD", code: "BHD", country: "Bahrain", name: "Bahraini Dinar" },
  { symbol: "OMR", code: "OMR", country: "Oman", name: "Omani Rial" },
  { symbol: "A$", code: "AUD", country: "Australia", name: "Australian Dollar" },
  { symbol: "C$", code: "CAD", country: "Canada", name: "Canadian Dollar" },
  { symbol: "NZ$", code: "NZD", country: "New Zealand", name: "New Zealand Dollar" },
  { symbol: "HK$", code: "HKD", country: "Hong Kong", name: "Hong Kong Dollar" },
  { symbol: "¥", code: "JPY", country: "Japan", name: "Japanese Yen" },
  { symbol: "CN¥", code: "CNY", country: "China", name: "Chinese Yuan" },
  { symbol: "₩", code: "KRW", country: "South Korea", name: "South Korean Won" },
  { symbol: "Rs", code: "LKR", country: "Sri Lanka", name: "Sri Lankan Rupee" },
  { symbol: "৳", code: "BDT", country: "Bangladesh", name: "Bangladeshi Taka" },
  { symbol: "रू", code: "NPR", country: "Nepal", name: "Nepalese Rupee" },
  { symbol: "PKR", code: "PKR", country: "Pakistan", name: "Pakistani Rupee" },
  { symbol: "₱", code: "PHP", country: "Philippines", name: "Philippine Peso" },
  { symbol: "฿", code: "THB", country: "Thailand", name: "Thai Baht" },
  { symbol: "Rp", code: "IDR", country: "Indonesia", name: "Indonesian Rupiah" },
  { symbol: "₫", code: "VND", country: "Vietnam", name: "Vietnamese Dong" },
  { symbol: "CHF", code: "CHF", country: "Switzerland", name: "Swiss Franc" },
  { symbol: "kr", code: "SEK", country: "Sweden", name: "Swedish Krona" },
  { symbol: "R", code: "ZAR", country: "South Africa", name: "South African Rand" },
  { symbol: "₦", code: "NGN", country: "Nigeria", name: "Nigerian Naira" },
  { symbol: "KSh", code: "KES", country: "Kenya", name: "Kenyan Shilling" },
  { symbol: "R$", code: "BRL", country: "Brazil", name: "Brazilian Real" },
  { symbol: "MX$", code: "MXN", country: "Mexico", name: "Mexican Peso" },
  { symbol: "₺", code: "TRY", country: "Turkey", name: "Turkish Lira" },
  { symbol: "₪", code: "ILS", country: "Israel", name: "Israeli Shekel" },
];

