// Auswahlliste: ~100 größte bekannte Firmen aus den USA und Europa (Euro + Schweizer Franken).
// Alle 5 Jahre erneuern (nächstes Mal: November 2031). Format: [Yahoo-Symbol, Name, Branche, Region]
export const UNIVERSUM = [
 // USA
 ["AAPL","Apple","Technologie","US"],["MSFT","Microsoft","Technologie","US"],["NVDA","Nvidia","Technologie","US"],
 ["AVGO","Broadcom","Technologie","US"],["ORCL","Oracle","Technologie","US"],["AMD","AMD","Technologie","US"],
 ["CRM","Salesforce","Technologie","US"],["CSCO","Cisco","Technologie","US"],["IBM","IBM","Technologie","US"],
 ["ADBE","Adobe","Technologie","US"],["QCOM","Qualcomm","Technologie","US"],["TXN","Texas Instruments","Technologie","US"],
 ["INTU","Intuit","Technologie","US"],["NOW","ServiceNow","Technologie","US"],["MU","Micron","Technologie","US"],
 ["AMAT","Applied Materials","Technologie","US"],["LRCX","Lam Research","Technologie","US"],["INTC","Intel","Technologie","US"],
 ["PLTR","Palantir","Technologie","US"],
 ["GOOGL","Alphabet","Kommunikation","US"],["META","Meta","Kommunikation","US"],["NFLX","Netflix","Kommunikation","US"],
 ["DIS","Disney","Kommunikation","US"],["T","AT&T","Kommunikation","US"],["VZ","Verizon","Kommunikation","US"],
 ["AMZN","Amazon","Konsum","US"],["TSLA","Tesla","Konsum","US"],["HD","Home Depot","Konsum","US"],
 ["MCD","McDonald's","Konsum","US"],["BKNG","Booking","Konsum","US"],["LOW","Lowe's","Konsum","US"],["UBER","Uber","Industrie","US"],
 ["WMT","Walmart","Basiskonsum","US"],["COST","Costco","Basiskonsum","US"],["PG","Procter & Gamble","Basiskonsum","US"],
 ["KO","Coca-Cola","Basiskonsum","US"],["PEP","PepsiCo","Basiskonsum","US"],["PM","Philip Morris","Basiskonsum","US"],
 ["BRK-B","Berkshire Hathaway","Finanzen","US"],["JPM","JPMorgan","Finanzen","US"],["V","Visa","Finanzen","US"],
 ["MA","Mastercard","Finanzen","US"],["BAC","Bank of America","Finanzen","US"],["WFC","Wells Fargo","Finanzen","US"],
 ["MS","Morgan Stanley","Finanzen","US"],["GS","Goldman Sachs","Finanzen","US"],["AXP","American Express","Finanzen","US"],
 ["C","Citigroup","Finanzen","US"],["SCHW","Charles Schwab","Finanzen","US"],["BLK","BlackRock","Finanzen","US"],["SPGI","S&P Global","Finanzen","US"],
 ["LLY","Eli Lilly","Gesundheit","US"],["UNH","UnitedHealth","Gesundheit","US"],["JNJ","Johnson & Johnson","Gesundheit","US"],
 ["ABBV","AbbVie","Gesundheit","US"],["MRK","Merck & Co.","Gesundheit","US"],["ABT","Abbott","Gesundheit","US"],
 ["TMO","Thermo Fisher","Gesundheit","US"],["ISRG","Intuitive Surgical","Gesundheit","US"],["AMGN","Amgen","Gesundheit","US"],["PFE","Pfizer","Gesundheit","US"],
 ["XOM","ExxonMobil","Energie","US"],["CVX","Chevron","Energie","US"],["NEE","NextEra Energy","Versorger","US"],
 ["GE","GE Aerospace","Industrie","US"],["CAT","Caterpillar","Industrie","US"],["RTX","RTX","Industrie","US"],
 ["BA","Boeing","Industrie","US"],["HON","Honeywell","Industrie","US"],["UNP","Union Pacific","Industrie","US"],
 ["LIN","Linde","Rohstoffe","US"],
 // Europa
 ["ASML.AS","ASML","Technologie","EU"],["SAP.DE","SAP","Technologie","EU"],["IFX.DE","Infineon","Technologie","EU"],
 ["DTE.DE","Deutsche Telekom","Kommunikation","EU"],
 ["MC.PA","LVMH","Konsum","EU"],["RMS.PA","Hermès","Konsum","EU"],["KER.PA","Kering","Konsum","EU"],["CFR.SW","Richemont","Konsum","EU"],
 ["ITX.MC","Inditex","Konsum","EU"],["ADS.DE","Adidas","Konsum","EU"],["MBG.DE","Mercedes-Benz","Konsum","EU"],
 ["BMW.DE","BMW","Konsum","EU"],["VOW3.DE","Volkswagen","Konsum","EU"],["EL.PA","EssilorLuxottica","Gesundheit","EU"],
 ["NESN.SW","Nestlé","Basiskonsum","EU"],["OR.PA","L'Oréal","Basiskonsum","EU"],["ABI.BR","AB InBev","Basiskonsum","EU"],
 ["ALV.DE","Allianz","Finanzen","EU"],["MUV2.DE","Munich Re","Finanzen","EU"],["CS.PA","AXA","Finanzen","EU"],
 ["ZURN.SW","Zurich Insurance","Finanzen","EU"],["UBSG.SW","UBS","Finanzen","EU"],["BNP.PA","BNP Paribas","Finanzen","EU"],
 ["SAN.MC","Banco Santander","Finanzen","EU"],["BBVA.MC","BBVA","Finanzen","EU"],["UCG.MI","UniCredit","Finanzen","EU"],
 ["ISP.MI","Intesa Sanpaolo","Finanzen","EU"],["INGA.AS","ING","Finanzen","EU"],["DB1.DE","Deutsche Börse","Finanzen","EU"],
 ["NOVN.SW","Novartis","Gesundheit","EU"],["ROG.SW","Roche","Gesundheit","EU"],["SAN.PA","Sanofi","Gesundheit","EU"],
 ["BAYN.DE","Bayer","Gesundheit","EU"],["LONN.SW","Lonza","Gesundheit","EU"],
 ["TTE.PA","TotalEnergies","Energie","EU"],["IBE.MC","Iberdrola","Versorger","EU"],["ENEL.MI","Enel","Versorger","EU"],
 ["SIE.DE","Siemens","Industrie","EU"],["AIR.PA","Airbus","Industrie","EU"],["SU.PA","Schneider Electric","Industrie","EU"],
 ["SAF.PA","Safran","Industrie","EU"],["ABBN.SW","ABB","Industrie","EU"],["DG.PA","Vinci","Industrie","EU"],
 ["RHM.DE","Rheinmetall","Industrie","EU"],["AI.PA","Air Liquide","Rohstoffe","EU"],["BAS.DE","BASF","Rohstoffe","EU"],
];
// Weitere Bausteine
export const SPY = "SPY", STOXX = "EXSA.DE", GOLD = "4GLD.DE", GELD = "XEON.DE", EURUSD = "EURUSD=X", EURCHF = "EURCHF=X";
export const EXTRA = {
 [GOLD]: ["Gold (Xetra-Gold, €)","Gold","EU"],
 [GELD]: ["Geldmarkt (XEON, €)","Geldmarkt","EU"],
 [STOXX]: ["STOXX Europe 600 (EXSA)","Index","EU"],
 [SPY]: ["S&P 500 (SPY)","Index","US"],
};
export const waehrung = s => s.endsWith(".SW") ? "CHF" : /\.(DE|PA|AS|MC|MI|BR|HE)$/.test(s) ? "EUR" : "USD";
