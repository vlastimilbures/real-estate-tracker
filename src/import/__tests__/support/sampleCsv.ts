// The sample portfolio (.claude/rules/engine-parity.md) as the four import CSV files,
// shared by the parser tests (csv.test.ts) and the parity import (import.test.ts).
export const PROPERTIES_CSV = `name,address,type,size_m2,garage,purchase_date,purchase_price,appreciation_override_pa,rent_index_override_pa
Byt Javorova,Javorova 12 Praha,3 bedroom,71,true,2015-06-01,4080000,,
Byt Lipova,Lipova 7 Praha,1 bedroom,55,false,2022-01-15,7225000,,
Byt Dubova,Dubova 3 Praha,1 bedroom,47,true,2023-02-01,6375000,,`;

export const VALUATIONS_CSV = `property_name,valid_from,valid_to,market_value
Byt Javorova,2026-06-01,,10200000
Byt Lipova,2026-06-01,,8925000
Byt Dubova,2026-06-01,,9605000`;

export const RENTS_CSV = `property_name,start_date,end_date,monthly_rent
Byt Javorova,2025-09-01,,27200
Byt Dubova,2025-07-01,,21675
Byt Lipova,2025-09-01,2026-08-30,21675
Byt Lipova,2026-09-01,,23205`;

export const MORTGAGES_CSV = `property_name,start_date,initial_principal,fixation_years,interest_rate_pa,monthly_instalment
Byt Javorova,2021-01-17,1912500,10,0.0169,6721.8
Byt Lipova,2022-01-15,5610000,7,0.0359,25567.15
Byt Dubova,2024-03-12,3034500,7,0.0449,21576.4`;

export const ALL_NAMES = new Set(["Byt Javorova", "Byt Lipova", "Byt Dubova"]);
