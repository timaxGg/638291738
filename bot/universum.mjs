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
 [GOLD]: ["Gold (Xetra-Gold, €)","Gold","EU","DE000A0S9GB0"],
 [GELD]: ["Geldmarkt (XEON, €)","Geldmarkt","EU","LU0290358497"],
 [STOXX]: ["STOXX Europe 600 (EXSA)","Index","EU","DE0002635307"],
 [SPY]: ["S&P 500 (SPY)","Index","US"],
};
export const waehrung = s => s.endsWith(".SW") ? "CHF" : /\.(DE|PA|AS|MC|MI|BR|HE)$/.test(s) ? "EUR" : "USD";
// ISIN für die Suche bei Trade Republic (Stammaktien; Quelle: Bigdata.com)
export const ISIN = {
 AAPL:"US0378331005",MSFT:"US5949181045",NVDA:"US67066G1040",AVGO:"US11135F1012",ORCL:"US68389X1054",AMD:"US0079031078",CRM:"US79466L3024",CSCO:"US17275R1023",IBM:"US4592001014",ADBE:"US00724F1012",QCOM:"US7475251036",TXN:"US8825081040",INTU:"US4612021034",NOW:"US81762P1021",MU:"US5951121038",AMAT:"US0382221051",LRCX:"US5128073062",INTC:"US4581401001",PLTR:"US69608A1088",
 GOOGL:"US02079K3059",META:"US30303M1027",NFLX:"US64110L1061",DIS:"US2546871060",T:"US00206R1023",VZ:"US92343V1044",AMZN:"US0231351067",TSLA:"US88160R1014",HD:"US4370761029",MCD:"US5801351017",BKNG:"US09857L1089",LOW:"US5486611073",UBER:"US90353T1007",
 WMT:"US9311421039",COST:"US22160K1051",PG:"US7427181091",KO:"US1912161007",PEP:"US7134481081",PM:"US7181721090","BRK-B":"US0846707026",JPM:"US46625H1005",V:"US92826C8394",MA:"US57636Q1040",BAC:"US0605051046",WFC:"US9497461015",MS:"US6174464486",GS:"US38141G1040",AXP:"US0258161092",C:"US1729674242",SCHW:"US8085131055",BLK:"US09290D1019",SPGI:"US78409V1044",
 LLY:"US5324571083",UNH:"US91324P1021",JNJ:"US4781601046",ABBV:"US00287Y1091",MRK:"US58933Y1055",ABT:"US0028241000",TMO:"US8835561023",ISRG:"US46120E6023",AMGN:"US0311621009",PFE:"US7170811035",XOM:"US30233Q1085",CVX:"US1667641005",NEE:"US65339F1012",GE:"US3696043013",CAT:"US1491231015",RTX:"US75513E1010",BA:"US0970231058",HON:"US4385162056",UNP:"US9078181081",LIN:"IE000S9YS762",
 "ASML.AS":"NL0010273215","SAP.DE":"DE0007164600","IFX.DE":"DE0006231004","DTE.DE":"DE0005557508","MC.PA":"FR0000121014","RMS.PA":"FR0000052292","KER.PA":"FR0000121485","CFR.SW":"CH0210483332","ITX.MC":"ES0148396007","ADS.DE":"DE000A1EWWW0","MBG.DE":"DE0007100000","BMW.DE":"DE0005190003","VOW3.DE":"DE0007664039","EL.PA":"FR0000121667",
 "NESN.SW":"CH0038863350","OR.PA":"FR0000120321","ABI.BR":"BE0974293251","ALV.DE":"DE0008404005","MUV2.DE":"DE0008430026","CS.PA":"FR0000120628","ZURN.SW":"CH0011075394","UBSG.SW":"CH0244767585","BNP.PA":"FR0000131104","SAN.MC":"ES0113900J37","BBVA.MC":"ES0113211835","UCG.MI":"IT0005239360","ISP.MI":"IT0000072618","INGA.AS":"NL0011821202","DB1.DE":"DE0005810055",
 "NOVN.SW":"CH0012005267","ROG.SW":"CH0012032048","SAN.PA":"FR0000120578","BAYN.DE":"DE000BAY0017","LONN.SW":"CH0013841017","TTE.PA":"FR0000120271","IBE.MC":"ES0144580Y14","ENEL.MI":"IT0003128367","SIE.DE":"DE0007236101","AIR.PA":"NL0000235190","SU.PA":"FR0000121972","SAF.PA":"FR0000073272","ABBN.SW":"CH0012221716","DG.PA":"FR0000125486","RHM.DE":"DE0007030009","AI.PA":"FR0000120073","BAS.DE":"DE000BASF111",
};
export const ART = {"4GLD.DE": "Gold-ETC", "XEON.DE": "Geldmarkt-ETF", "EXSA.DE": "ETF", "SPY": "ETF"};
