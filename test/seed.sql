-- TEST DATA ONLY (approximate coordinates). Real data comes from data.gov.in.
insert into pincodes values
 ('721301','Paschim Medinipur','West Bengal',22.33,87.32),
 ('721302','Paschim Medinipur','West Bengal',22.31,87.31),
 ('721101','Paschim Medinipur','West Bengal',22.42,87.32),
 ('722101','Bankura','West Bengal',23.23,87.07),
 ('700001','Kolkata','West Bengal',22.57,88.36)
on conflict do nothing;
