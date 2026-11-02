/** Synthetic statements. Every name and number here is made up. */

export const KOTAK_CSV = `,,Account Statement,,,,,,
JOHN Q SAMPLE,,,,,,,,
,,,,Period,From 01/09/2026 To 30/09/2026,,,
,,,,Currency,INR,,,
,,,,,,,,
Sl. No.,Transaction Date,Value Date,Description,Chq /Ref No.,Amount,Dr / Cr,Balance,Dr / Cr
1,01-09-2026 10:15:00,01-09-2026,UPI/RAVI KUMAR/HDFC/600000000001/Sent using P,UPI-700000000001,2000.00,CR,2100.00,CR
2,01-09-2026 22:41:10,01-09-2026,UPI/SHARMA PAN SHOP/YESB/600000000002/UPI,UPI-700000000002,40.00,DR,2060.00,CR
3,02-09-2026 13:05:44,02-09-2026,UPI/ZOMATO/HDFC/600000000003/UPI,UPI-700000000003,"1,250.50",DR,809.50,CR
4,03-09-2026 18:20:00,03-09-2026,UPI/Self Name/SBIN/600000000004/diesel,UPI-700000000004,500.00,DR,309.50,CR
5,05-09-2026 09:00:00,05-09-2026,CHRG:SMS ALERT FEE FOR THE MONTH OF AUG26,,1.77,DR,307.73,CR
6,06-09-2026 19:30:00,06-09-2026,UPI/GREEN CAR WASHI/YESB/600000000006/UPI(Value Date: 06-09-2026),UPI-700000000006,300.00,DR,7.73,CR
Closing Balance,as on 30/09/2026 INR 7.73,,,,,,,
,,,,,,,,
Important Note:,,,,,,,,
Write to us at Customer Contact Centre. Kotak Mahindra Bank Ltd.,,,,,,,,
`;

/** HDFC-style: separate withdrawal / deposit columns, newest first. */
export const DEBIT_CREDIT_CSV = `Date,Narration,Chq./Ref.No.,Value Dt,Withdrawal Amt.,Deposit Amt.,Closing Balance
12/09/26,UPI-SWIGGY-swiggy@icici-ICIC0000001-600000000013-order,0000600000000013,12/09/26,350.00,,4650.00
10/09/26,NEFT AXNB000000001 ACME PAYROLL PVT LTD,AXNB000000001,10/09/26,,5000.00,5000.00
`;
