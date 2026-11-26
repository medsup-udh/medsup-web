# 04 — การออกแบบฐานข้อมูล (Database Design & Data Dictionary)

> สถานะ: Phase 0 — ร่างเพื่อตรวจรับ (ยังไม่มีการสร้างฐานข้อมูลจริง)
> ฐานข้อมูลเป้าหมาย: PostgreSQL 16 ขึ้นไป (เหตุผลใน `10_SYSTEM_ARCHITECTURE.md`)
> แผนภาพ ER: `05_ER_DIAGRAM.md` · กฎที่อ้างถึง: `02_BUSINESS_RULES.md`
> ตัวอย่าง SQL ในเอกสารนี้เป็น **ตัวอย่างประกอบการออกแบบ** ไม่ใช่ migration จริง

## 1. หลักการออกแบบ

| หลักการ | รายละเอียด |
|---|---|
| ความถูกต้องอยู่ที่ฐานข้อมูล | กฎที่ห้ามพลาด (เลขซ้ำ, แก้เอกสารที่ออกแล้ว, ตัดหนี้เกิน, audit ถูกแก้) บังคับด้วย constraint/trigger ไม่ใช่แค่โค้ดแอป |
| ไม่ลบ ไม่เขียนทับ | ข้อมูลที่ออกแล้วเปลี่ยนได้เฉพาะสถานะ; การแก้ไขคือการสร้างรายการใหม่ + เชื่อมโยง |
| Snapshot | เอกสารเก็บสำเนาข้อมูลผู้ขาย ผู้ซื้อ สินค้า ภาษี ณ วันออก (§7) |
| เงินเป็น numeric | `numeric(14,2)` สำหรับเงิน, `numeric(14,4)` สำหรับราคาต่อหน่วย, `numeric(14,3)` สำหรับจำนวน, `numeric(5,2)` สำหรับอัตรา % |
| เวลา | `timestamptz` (เก็บ UTC) สำหรับเหตุการณ์, `date` สำหรับวันที่ทางธุรกิจ (ตาม Asia/Bangkok) |
| Primary key | `uuid` (UUIDv7 สร้างฝั่งแอป — เรียงตามเวลา, เดาไม่ได้ใน URL); ยกเว้น `audit_logs` ใช้ `bigint identity` เพื่อเรียงลำดับ hash chain |
| ชื่อ | snake_case ภาษาอังกฤษ, ตารางพหูพจน์, enum เป็นตัวพิมพ์ใหญ่ |
| Optimistic locking | ตารางที่ผู้ใช้แก้ไขได้มี `row_version int` — บันทึกเมื่อค่าตรงกันเท่านั้น (กันเปิดสองแท็บแล้วทับกัน) |

### 1.1 คอลัมน์มาตรฐาน (ทุกตารางยกเว้นที่ระบุ)

| คอลัมน์ | ชนิด | Null | ค่าเริ่มต้น | คำอธิบาย |
|---|---|---|---|---|
| `id` | uuid | ไม่ | — | Primary key |
| `created_at` | timestamptz | ไม่ | `now()` | เวลาสร้าง |
| `created_by` | uuid → users | ไม่ | — | ผู้สร้าง |
| `updated_at` | timestamptz | ไม่ | `now()` | เวลาแก้ล่าสุด (trigger) |
| `updated_by` | uuid → users | ไม่ | — | ผู้แก้ล่าสุด |
| `row_version` | int | ไม่ | 1 | เพิ่มทุกครั้งที่แก้ |

### 1.2 ชุดคอลัมน์ที่อยู่ (Address Block) — ใช้ซ้ำใน companies, company_branches, customer_branches

| คอลัมน์ | ชนิด | Null | คำอธิบาย |
|---|---|---|---|
| `addr_line` | text | ไม่ | เลขที่ หมู่ อาคาร ซอย ถนน |
| `subdistrict` | text | ได้ | แขวง/ตำบล |
| `district` | text | ได้ | เขต/อำเภอ |
| `province` | text | ได้ | จังหวัด |
| `postal_code` | char(5) | ได้ | CHECK `^[0-9]{5}$` |
| `country_code` | char(2) | ไม่ | ค่าเริ่มต้น `TH` |

### 1.3 Enum ที่ใช้

| Enum | ค่า |
|---|---|
| `doc_type` | `QT`, `DN`, `INV`, `RC` |
| `lifecycle_status` | `DRAFT`, `ISSUED`, `CANCELLED`, `SUPERSEDED` |
| `payment_status` | `NOT_APPLICABLE`, `UNPAID`, `PARTIALLY_PAID`, `PAID` |
| `branch_type` | `HEAD_OFFICE`, `BRANCH` |
| `price_mode` | `EXCLUSIVE` (ราคาไม่รวม VAT), `INCLUSIVE` (ราคารวม VAT) |
| `tax_category` | `VAT_STD` (อัตราปกติ), `VAT_ZERO` (อัตรา 0%), `EXEMPT` (ยกเว้น), `OUT_OF_SCOPE` (ไม่อยู่ในบังคับ) |
| `discount_type` | `NONE`, `PERCENT`, `AMOUNT` |
| `link_type` | `CREATED_FROM`, `REPLACES`, `RECEIPT_FOR`, `RELATED` |
| `payment_method` | `CASH`, `BANK_TRANSFER`, `PROMPTPAY`, `CHEQUE`, `CREDIT_CARD`, `OTHER` |
| `record_status` | `ACTIVE`, `REVERSED` |
| `file_purpose` | `DOCUMENT_PDF`, `BATCH_PDF`, `LOGO`, `SIGNATURE`, `REPORT_EXPORT`, `ATTACHMENT` |
| `file_variant` | `ORIGINAL`, `COPY`, `ORIGINAL_AND_COPY`, `REPLACEMENT_COPY`, `NONE` |
| `cancel_reason_code` | `WRONG_BUYER_INFO`, `WRONG_ITEMS`, `DUPLICATE`, `SALE_NOT_OCCURRED`, `PAYMENT_FAILED`, `OTHER` |
| `customer_type` | `JURISTIC`, `INDIVIDUAL` |
| `user_role` | `OWNER`, `VIEWER` (VIEWER สำรองไว้อนาคต) |

## 2. รายการตาราง

| # | ตาราง | จาก Spec | หน้าที่ |
|---|---|---|---|
| T01 | `companies` | ✓ | ข้อมูลกิจการ |
| T02 | `company_branches` | ✓ | สำนักงานใหญ่และสาขา |
| T03 | `company_bank_accounts` | เพิ่ม | บัญชีธนาคารที่แสดงในเอกสาร |
| T04 | `users` | เพิ่ม (C-05) | ผู้ใช้ (Audit ต้องระบุ User) |
| T05 | `customers` | ✓ | ลูกค้า (นิติบุคคล/บุคคล) |
| T06 | `customer_branches` | เพิ่ม | สถานประกอบการ/ที่อยู่ออกเอกสารของลูกค้า (สำนักงานใหญ่/สาขา) |
| T07 | `customer_contacts` | เพิ่ม | ผู้ติดต่อ |
| T08 | `products` | ✓ | สินค้า (ไม่มีสต็อก) |
| T09 | `product_price_history` | ✓ | ประวัติราคา |
| T10 | `documents` | ✓ | หัวเอกสารทุกประเภท |
| T11 | `document_items` | ✓ | รายการในเอกสาร |
| T12 | `document_links` | ✓ | ความสัมพันธ์เอกสาร |
| T13 | `document_sequences` | ✓ | Running number |
| T14 | `document_revisions` | ✓ | ประวัติฉบับแก้ไข (snapshot JSON) |
| T15 | `payments` | ✓ | การรับชำระเงิน |
| T16 | `payment_allocations` | ✓ | การจัดสรรยอดรับชำระให้ใบกำกับภาษี |
| T17 | `tax_settings` | ✓ | อัตราภาษีตามช่วงเวลา |
| T18 | `document_files` | ✓ | ไฟล์ PDF และไฟล์อื่น (โลโก้, ลายเซ็น, export) |
| T19 | `audit_logs` | ✓ | ประวัติการดำเนินการ (append-only) |
| T20 | `system_settings` | ✓ | การตั้งค่าระบบแบบ key–value |
| T21 | `idempotency_keys` | เพิ่ม | กันคำสั่งซ้ำ (BR-DOC-06) |
| T22 | `backup_runs` | เพิ่ม | บันทึกผลสำรอง/ทดสอบกู้คืน (FR-SET-05) |

> ตาราง session/บัญชีเข้าสู่ระบบ ขึ้นกับไลบรารี Auth ที่เลือกใน D-02 (ดู `10_SYSTEM_ARCHITECTURE.md` §5) จึงไม่ระบุในนี้

---

## 3. Data Dictionary

### T01 `companies`

| คอลัมน์ | ชนิด | Null | Constraint / ค่าเริ่มต้น | คำอธิบาย |
|---|---|---|---|---|
| id | uuid | ไม่ | PK | |
| name_th | text | ไม่ | length 1–200 | ชื่อบริษัทภาษาไทย (ตามหนังสือรับรอง) |
| name_en | text | ได้ | | ชื่อภาษาอังกฤษ |
| tax_id | char(13) | ไม่ | UNIQUE, CHECK `^[0-9]{13}$` | เลขประจำตัวผู้เสียภาษี (checksum ตรวจที่ SVC) |
| (address block) | | | §1.2 | ที่อยู่จดทะเบียน |
| phone | text | ได้ | | |
| email | text | ได้ | | |
| website | text | ได้ | | |
| logo_file_id | uuid → document_files | ได้ | FK RESTRICT | โลโก้ปัจจุบัน (เปลี่ยน = ไฟล์ใหม่) |
| signatory_name | text | ได้ | | ผู้มีอำนาจลงนาม |
| signatory_title | text | ได้ | | ตำแหน่ง |
| signature_file_id | uuid → document_files | ได้ | FK RESTRICT | ภาพลายเซ็น (D-13) |
| doc_display | jsonb | ไม่ | `'{}'` | ตั้งค่าการแสดง: show_name_en, footer_text, … |
| is_active | boolean | ไม่ | true | |
| + คอลัมน์มาตรฐาน | | | | |

### T02 `company_branches`

| คอลัมน์ | ชนิด | Null | Constraint | คำอธิบาย |
|---|---|---|---|---|
| id | uuid | ไม่ | PK | |
| company_id | uuid → companies | ไม่ | FK RESTRICT | |
| branch_type | branch_type | ไม่ | | |
| branch_code | char(5) | ไม่ | CHECK `^[0-9]{5}$`; CHECK `(branch_type='HEAD_OFFICE') = (branch_code='00000')` | รหัสสาขาตามใบ ภ.พ.20 |
| name | text | ไม่ | | เช่น "สำนักงานใหญ่" |
| (address block) | | | | ที่อยู่สาขา (ใช้บนเอกสารที่สาขานี้ออก) |
| phone | text | ได้ | | |
| is_default | boolean | ไม่ | false | สาขาที่ออกเอกสารเป็นค่าเริ่มต้น |
| is_active | boolean | ไม่ | true | |

Unique: `(company_id, branch_code)`; partial unique `(company_id) WHERE branch_type='HEAD_OFFICE'`; partial unique `(company_id) WHERE is_default`

### T03 `company_bank_accounts`

| คอลัมน์ | ชนิด | Null | Constraint | คำอธิบาย |
|---|---|---|---|---|
| id | uuid | ไม่ | PK | |
| company_id | uuid → companies | ไม่ | FK RESTRICT | |
| bank_name | text | ไม่ | | เช่น ธนาคารกสิกรไทย |
| bank_branch | text | ได้ | | สาขาธนาคาร |
| account_name | text | ไม่ | | ชื่อบัญชี |
| account_no | text | ไม่ | CHECK ตัวเลขและขีด | เลขบัญชี |
| account_type | text | ได้ | | ออมทรัพย์/กระแสรายวัน |
| promptpay_id | text | ได้ | | (อนาคต: QR) |
| show_on_documents | boolean | ไม่ | true | |
| sort_order | int | ไม่ | 0 | |
| is_active | boolean | ไม่ | true | |

### T04 `users`

| คอลัมน์ | ชนิด | Null | Constraint | คำอธิบาย |
|---|---|---|---|---|
| id | uuid | ไม่ | PK | |
| email | citext | ไม่ | UNIQUE | ใช้เข้าสู่ระบบ |
| display_name | text | ไม่ | | ชื่อที่แสดงใน audit |
| role | user_role | ไม่ | `OWNER` | |
| mfa_enabled | boolean | ไม่ | false | (D-10) |
| last_login_at | timestamptz | ได้ | | |
| is_active | boolean | ไม่ | true | |

> รหัสผ่าน (hash แบบ Argon2id/bcrypt) และ session อยู่ในตารางของไลบรารี Auth — ไม่เก็บรหัสผ่านในตารางนี้

### T05 `customers`

| คอลัมน์ | ชนิด | Null | Constraint | คำอธิบาย |
|---|---|---|---|---|
| id | uuid | ไม่ | PK | |
| company_id | uuid → companies | ไม่ | FK RESTRICT | |
| customer_code | text | ไม่ | UNIQUE (company_id, lower(customer_code)) | C-0001 |
| customer_type | customer_type | ไม่ | | |
| name_th | text | ไม่ | | ชื่อ (ไทย) |
| name_en | text | ได้ | | |
| tax_id | char(13) | ได้ | CHECK `^[0-9]{13}$` | ไม่ unique (BR-CU-07: เตือนเท่านั้น) |
| is_vat_registered | boolean | ไม่ | false; CHECK `NOT is_vat_registered OR tax_id IS NOT NULL` | ผู้ประกอบการจด VAT (BR-CU-02) |
| default_credit_days | int | ไม่ | 0; CHECK 0–365 | เครดิตเทอม |
| default_price_mode | price_mode | ได้ | | ค่าเริ่มต้นเฉพาะลูกค้า |
| phone, email | text | ได้ | | ติดต่อทั่วไป |
| notes | text | ได้ | | หมายเหตุภายใน |
| is_active | boolean | ไม่ | true | |

Index: `(company_id, is_active)`, GIN trigram บน `name_th`, `name_en`, `customer_code`; btree บน `tax_id`

### T06 `customer_branches` (สถานประกอบการ/ที่อยู่ออกเอกสารของลูกค้า)

| คอลัมน์ | ชนิด | Null | Constraint | คำอธิบาย |
|---|---|---|---|---|
| id | uuid | ไม่ | PK | |
| customer_id | uuid → customers | ไม่ | FK RESTRICT | |
| label | text | ไม่ | | ชื่อเรียก เช่น "สำนักงานใหญ่", "คลังบางนา" |
| branch_type | branch_type | ได้ | ต้องมีค่าถ้าลูกค้าจด VAT (ตรวจที่ SVC + trigger) | |
| branch_code | char(5) | ได้ | CHECK `^[0-9]{5}$` | |
| (address block) | | | | ที่อยู่สำหรับออกเอกสาร |
| ship_to_text | text | ได้ | | ที่อยู่จัดส่งเริ่มต้น (DN) |
| is_default | boolean | ไม่ | false | |
| is_active | boolean | ไม่ | true | |

Unique: `(customer_id, branch_code) WHERE branch_code IS NOT NULL`; partial unique `(customer_id) WHERE is_default`

### T07 `customer_contacts`

| คอลัมน์ | ชนิด | Null | คำอธิบาย |
|---|---|---|---|
| id | uuid | ไม่ | PK |
| customer_id | uuid → customers | ไม่ | FK CASCADE (ข้อมูลติดต่อไม่ใช่หลักฐานภาษี; เอกสารเก็บ snapshot แล้ว) |
| name | text | ไม่ | |
| position | text | ได้ | |
| phone, email, line_id | text | ได้ | |
| is_primary | boolean | ไม่ | false |
| notes | text | ได้ | |

### T08 `products`

| คอลัมน์ | ชนิด | Null | Constraint | คำอธิบาย |
|---|---|---|---|---|
| id | uuid | ไม่ | PK | |
| company_id | uuid → companies | ไม่ | FK RESTRICT | |
| product_code | text | ไม่ | UNIQUE (company_id, lower(product_code)) | |
| name | text | ไม่ | | |
| description | text | ได้ | | |
| unit | text | ไม่ | | หน่วยนับ (ชิ้น, กล่อง, ม้วน …) |
| default_tax_category | tax_category | ไม่ | `VAT_STD` | |
| latest_price | numeric(14,4) | ได้ | CHECK ≥ 0 | ราคาล่าสุด (cache จากประวัติ) |
| latest_price_mode | price_mode | ได้ | | |
| latest_price_at | timestamptz | ได้ | | |
| is_active | boolean | ไม่ | true | |

Index: GIN trigram บน `name`, `product_code`. **ไม่มีคอลัมน์จำนวนคงเหลือ** (FR-PR-09)

### T09 `product_price_history` (insert-only)

| คอลัมน์ | ชนิด | Null | Constraint | คำอธิบาย |
|---|---|---|---|---|
| id | uuid | ไม่ | PK | |
| product_id | uuid → products | ไม่ | FK RESTRICT | |
| unit_price | numeric(14,4) | ไม่ | CHECK ≥ 0 | ราคาที่ใช้ |
| price_mode | price_mode | ไม่ | | |
| unit_price_ex_vat | numeric(14,4) | ไม่ | | ราคาก่อน VAT เทียบเท่า (BR-PR-04) |
| source | text | ไม่ | CHECK IN ('DOCUMENT','MANUAL') | |
| document_id | uuid → documents | ได้ | FK RESTRICT; CHECK (source='DOCUMENT') = (document_id IS NOT NULL) | |
| document_item_id | uuid → document_items | ได้ | FK RESTRICT | |
| doc_type | doc_type | ได้ | | QT/DN/INV |
| customer_id | uuid → customers | ได้ | FK RESTRICT | |
| effective_date | date | ไม่ | | วันที่เอกสาร หรือวันที่แก้ราคา |
| recorded_at | timestamptz | ไม่ | now() | |
| recorded_by | uuid → users | ไม่ | | |

Index: `(product_id, effective_date DESC, recorded_at DESC)`, `(product_id, customer_id, doc_type, effective_date DESC)`
Trigger: ปฏิเสธ UPDATE/DELETE (BR-PR-05)

### T10 `documents`

| คอลัมน์ | ชนิด | Null | Constraint | คำอธิบาย |
|---|---|---|---|---|
| id | uuid | ไม่ | PK | |
| company_id | uuid → companies | ไม่ | FK RESTRICT | |
| company_branch_id | uuid → company_branches | ไม่ | FK RESTRICT | สาขาที่ออกเอกสาร (กำหนดลำดับเลข) |
| doc_type | doc_type | ไม่ | | |
| lifecycle_status | lifecycle_status | ไม่ | `DRAFT` | |
| payment_status | payment_status | ไม่ | `NOT_APPLICABLE` (INV = `UNPAID` เมื่อออก) | ระบบปรับเท่านั้น |
| doc_no | text | ได้ | NULL เมื่อ DRAFT | เลขที่เอกสาร |
| sequence_id | uuid → document_sequences | ได้ | FK RESTRICT | |
| running_no | int | ได้ | CHECK > 0 | |
| doc_date | date | ไม่ | | วันที่เอกสาร (INV = วันที่ใบกำกับภาษี) |
| due_date | date | ได้ | CHECK `due_date >= doc_date` | INV |
| valid_until | date | ได้ | CHECK `valid_until >= doc_date` | QT |
| delivery_date | date | ได้ | | DN |
| customer_id | uuid → customers | ไม่ | FK RESTRICT | |
| customer_branch_id | uuid → customer_branches | ได้ | FK RESTRICT | |
| contact_id | uuid → customer_contacts | ได้ | FK SET NULL | |
| buyer_name | text | ไม่ | | **Snapshot ผู้ซื้อ** (แก้ได้ขณะร่าง) |
| buyer_tax_id | char(13) | ได้ | | |
| buyer_is_vat_registered | boolean | ไม่ | false | |
| buyer_branch_type | branch_type | ได้ | | |
| buyer_branch_code | char(5) | ได้ | | |
| buyer_address | text | ไม่ | | ที่อยู่แบบจัดรูปแล้ว |
| buyer_contact | jsonb | ได้ | | ชื่อ/โทร/อีเมลผู้ติดต่อ ณ วันออก |
| ship_to | text | ได้ | | DN: ที่อยู่จัดส่ง |
| seller_snapshot | jsonb | ได้ | NOT NULL เมื่อ ISSUED | **Snapshot ผู้ขาย** (BR-SNP-01) |
| reference_no | text | ได้ | | เลขที่ PO ของลูกค้า |
| payment_terms | text | ได้ | | |
| notes | text | ได้ | | หมายเหตุบนเอกสาร |
| internal_note | text | ได้ | | ไม่พิมพ์ |
| price_mode | price_mode | ไม่ | | |
| tax_setting_id | uuid → tax_settings | ไม่ | FK RESTRICT | อัตราที่มีผล ณ doc_date |
| vat_rate | numeric(5,2) | ไม่ | | Snapshot อัตรา |
| subtotal | numeric(14,2) | ไม่ | 0 | ผลรวมหลังส่วนลดรายบรรทัด (ขั้น 3) |
| line_discount_total | numeric(14,2) | ไม่ | 0 | |
| doc_discount_type | discount_type | ไม่ | `NONE` | |
| doc_discount_value | numeric(14,4) | ไม่ | 0 | % หรือจำนวนเงินที่ผู้ใช้กรอก |
| doc_discount_amount | numeric(14,2) | ไม่ | 0; CHECK ≤ subtotal | ส่วนลดท้ายเอกสารเป็นเงิน (ขั้น 4) |
| vatable_base | numeric(14,2) | ไม่ | 0 | ฐานภาษีอัตราปกติ (ขั้น 5) |
| zero_rated_amount | numeric(14,2) | ไม่ | 0 | |
| exempt_amount | numeric(14,2) | ไม่ | 0 | |
| out_of_scope_amount | numeric(14,2) | ไม่ | 0 | |
| vat_amount | numeric(14,2) | ไม่ | 0 | ขั้น 6 |
| grand_total | numeric(14,2) | ไม่ | 0; CHECK ≥ 0 | ขั้น 7 |
| amount_in_words | text | ได้ | NOT NULL เมื่อ ISSUED | จำนวนเงินตัวอักษร |
| calc_engine_version | text | ได้ | NOT NULL เมื่อ ISSUED | เช่น `tax-1.0.0` |
| template_version | text | ได้ | NOT NULL เมื่อ ISSUED | เช่น `inv-a4-1.0` |
| receipt_layout | text | ได้ | CHECK IN ('REFERENCE','ITEMS') | RC เท่านั้น (BR-RC-02) |
| payment_id | uuid → payments | ได้ | UNIQUE; FK RESTRICT; CHECK `(doc_type='RC') = (payment_id IS NOT NULL)` | RC ↔ การรับชำระ 1:1 |
| replaces_document_id | uuid → documents | ได้ | FK RESTRICT | ฉบับแทนของเลขใด |
| replacement_remark | text | ได้ | ต้องมีค่าเมื่อ INV และ replaces_document_id ไม่ว่าง | หมายเหตุตาม ป.86/2542 ข้อ 25 |
| original_returned_at | timestamptz | ได้ | | ยืนยันได้รับต้นฉบับคืน (BR-INV-07) |
| issued_at | timestamptz | ได้ | NOT NULL เมื่อ ISSUED | |
| issued_by | uuid → users | ได้ | | |
| cancelled_at | timestamptz | ได้ | | |
| cancelled_by | uuid → users | ได้ | | |
| cancel_reason_code | cancel_reason_code | ได้ | NOT NULL เมื่อ CANCELLED/SUPERSEDED | |
| cancel_reason | text | ได้ | length ≥ 10 เมื่อ CANCELLED/SUPERSEDED | |
| content_hash | char(64) | ได้ | NOT NULL เมื่อ ISSUED | SHA-256 ของ snapshot มาตรฐาน (BR-SNP-07) |
| deleted_at | timestamptz | ได้ | อนุญาตเฉพาะ DRAFT | ลบร่างแบบ soft |
| + คอลัมน์มาตรฐาน | | | | |

**Constraint หลัก**

```sql
-- เลขที่ไม่ซ้ำ (FR-NUM-04) — partial unique เพราะร่างไม่มีเลข
CREATE UNIQUE INDEX ux_documents_no ON documents (company_branch_id, doc_type, doc_no) WHERE doc_no IS NOT NULL;
CREATE UNIQUE INDEX ux_documents_seq ON documents (sequence_id, running_no) WHERE sequence_id IS NOT NULL;

-- เอกสารที่ไม่ใช่ร่างต้องมีข้อมูลครบ
ALTER TABLE documents ADD CONSTRAINT ck_issued_complete CHECK (
  lifecycle_status = 'DRAFT' OR (doc_no IS NOT NULL AND issued_at IS NOT NULL
    AND seller_snapshot IS NOT NULL AND content_hash IS NOT NULL AND amount_in_words IS NOT NULL));

-- ยกเลิก/แทนที่ต้องมีเหตุผล (FR-DOC-09)
ALTER TABLE documents ADD CONSTRAINT ck_cancel_reason CHECK (
  lifecycle_status NOT IN ('CANCELLED','SUPERSEDED')
  OR (cancel_reason_code IS NOT NULL AND length(cancel_reason) >= 10));

-- ใบกำกับภาษีของผู้ซื้อจด VAT ต้องมีเลขผู้เสียภาษีและสถานประกอบการ (BR-CU-02)
ALTER TABLE documents ADD CONSTRAINT ck_inv_buyer_vat CHECK (
  doc_type <> 'INV' OR lifecycle_status = 'DRAFT' OR NOT buyer_is_vat_registered
  OR (buyer_tax_id IS NOT NULL AND buyer_branch_type IS NOT NULL AND buyer_branch_code IS NOT NULL));
```

**Trigger `trg_documents_immutable` (BR-DOC-05, BR-ST-02)** — เมื่อแถวเดิม `lifecycle_status <> 'DRAFT'`:
- อนุญาตเปลี่ยนเฉพาะ: `lifecycle_status` (ตามตารางเปลี่ยนสถานะ), `payment_status`, `cancelled_*`, `cancel_reason*`, `original_returned_at`, `updated_*`, `row_version`
- คอลัมน์อื่นเปลี่ยน → `RAISE EXCEPTION`
- `DELETE` → ปฏิเสธเสมอ (ร่างใช้ `deleted_at`)

**Index:** `(company_id, doc_type, doc_date DESC)`, `(customer_id, doc_date DESC)`, `(lifecycle_status, doc_type)`, partial `(due_date) WHERE doc_type='INV' AND lifecycle_status='ISSUED' AND payment_status <> 'PAID'` (สำหรับ Dashboard ค้างชำระ/เกินกำหนด), GIN trigram บน `doc_no`, `buyer_name`

### T11 `document_items`

| คอลัมน์ | ชนิด | Null | Constraint | คำอธิบาย |
|---|---|---|---|---|
| id | uuid | ไม่ | PK | |
| document_id | uuid → documents | ไม่ | FK CASCADE (ลบได้เฉพาะตอนเอกสารเป็นร่าง — trigger) | |
| line_no | int | ไม่ | UNIQUE (document_id, line_no) | ลำดับบรรทัด |
| product_id | uuid → products | ได้ | FK RESTRICT; NULL = รายการ ad-hoc | |
| item_code | text | ได้ | | Snapshot |
| item_name | text | ไม่ | | Snapshot |
| description | text | ได้ | | Snapshot |
| unit | text | ได้ | | Snapshot |
| quantity | numeric(14,3) | ไม่ | CHECK > 0 | |
| unit_price | numeric(14,4) | ไม่ | CHECK ≥ 0 | ตาม price_mode ของเอกสาร |
| gross_amount | numeric(14,2) | ไม่ | | ขั้น 1: round2(จำนวน × ราคา) |
| line_discount_type | discount_type | ไม่ | `NONE` | |
| line_discount_value | numeric(14,4) | ไม่ | 0 | |
| line_discount_amount | numeric(14,2) | ไม่ | 0; CHECK ≤ gross_amount | ขั้น 2 |
| net_amount | numeric(14,2) | ไม่ | CHECK = gross − line_discount | |
| doc_discount_alloc | numeric(14,2) | ไม่ | 0 | ส่วนลดท้ายเอกสารที่เฉลี่ยมาบรรทัดนี้ (รายงานแยกสินค้า) |
| tax_category | tax_category | ไม่ | | |
| source_item_id | uuid → document_items | ได้ | FK RESTRICT | บรรทัดต้นทาง (QT → DN → INV) |

Trigger: ปฏิเสธ INSERT/UPDATE/DELETE เมื่อเอกสารแม่ไม่ใช่ DRAFT

### T12 `document_links`

| คอลัมน์ | ชนิด | Null | Constraint | คำอธิบาย |
|---|---|---|---|---|
| id | uuid | ไม่ | PK | |
| source_document_id | uuid → documents | ไม่ | FK RESTRICT | ต้นทาง |
| target_document_id | uuid → documents | ไม่ | FK RESTRICT; CHECK ≠ source | ปลายทาง |
| link_type | link_type | ไม่ | | |
| note | text | ได้ | | เช่น เหตุผลการสร้างซ้ำ (BR-DOC-09) |
| created_at, created_by | | ไม่ | | |

Unique: `(source_document_id, target_document_id, link_type)`; Index: `(target_document_id)`
ตารางนี้ insert-only; ลบได้เฉพาะเมื่อปลายทางยังเป็นร่างและถูกลบ

### T13 `document_sequences`

| คอลัมน์ | ชนิด | Null | Constraint | คำอธิบาย |
|---|---|---|---|---|
| id | uuid | ไม่ | PK | |
| company_branch_id | uuid → company_branches | ไม่ | FK RESTRICT | |
| doc_type | doc_type | ไม่ | | |
| period_key | text | ไม่ | | เช่น `2026` (ปีปฏิทิน) หรือ `FY2027` |
| period_start | date | ไม่ | | |
| period_end | date | ไม่ | CHECK > period_start | |
| format_pattern | text | ไม่ | | รูปแบบที่ใช้ในรอบนี้ เช่น `{PREFIX}-{YYYY}-{SEQ:4}` |
| prefix | text | ไม่ | | |
| last_number | int | ไม่ | 0; CHECK ≥ 0 | เลขล่าสุดที่ออก |
| last_doc_date | date | ได้ | | วันที่เอกสารล่าสุด (ใช้ตรวจ BR-DATE-02) |

Unique: `(company_branch_id, doc_type, period_key)`; Trigger: ห้าม `last_number` ลดลง, ห้าม DELETE (BR-NUM-05)

```sql
-- การออกเลข (ภายใน transaction เดียวกับการออกเอกสาร) — BR-NUM-03
UPDATE document_sequences
   SET last_number = last_number + 1, last_doc_date = GREATEST(coalesce(last_doc_date, $doc_date), $doc_date)
 WHERE company_branch_id = $branch AND doc_type = $type AND period_key = $period
RETURNING id, last_number, format_pattern, prefix;
-- ถ้าไม่มีแถว (ต้นรอบใหม่): INSERT ... ON CONFLICT DO NOTHING แล้ว UPDATE ซ้ำ (BR-NUM-08)
```

### T14 `document_revisions` (insert-only)

| คอลัมน์ | ชนิด | Null | Constraint | คำอธิบาย |
|---|---|---|---|---|
| id | uuid | ไม่ | PK | |
| document_id | uuid → documents | ไม่ | FK RESTRICT | |
| revision_no | int | ไม่ | UNIQUE (document_id, revision_no) | |
| event | text | ไม่ | CHECK IN ('DRAFT_SAVED','ISSUED','CANCELLED','SUPERSEDED','REPLACEMENT_COPY_ISSUED') | |
| snapshot | jsonb | ไม่ | | หัวเอกสาร + รายการ ทั้งหมด ณ ขณะนั้น |
| snapshot_hash | char(64) | ไม่ | | SHA-256 |
| change_summary | jsonb | ได้ | | diff เทียบ revision ก่อนหน้า |
| created_at, created_by | | ไม่ | | |

นโยบาย: เก็บ revision ร่างล่าสุด 50 รายการต่อเอกสาร (เก่ากว่านั้นลบได้ **เฉพาะของร่าง** ที่ยังไม่เคยออก) — revision `ISSUED` เก็บถาวร

### T15 `payments`

| คอลัมน์ | ชนิด | Null | Constraint | คำอธิบาย |
|---|---|---|---|---|
| id | uuid | ไม่ | PK | |
| company_id | uuid → companies | ไม่ | FK RESTRICT | |
| customer_id | uuid → customers | ไม่ | FK RESTRICT | |
| payment_ref | text | ไม่ | UNIQUE | เลขอ้างอิงภายใน PAY-2026-0001 (ไม่ใช่เอกสารภาษี) |
| payment_date | date | ไม่ | | วันที่ได้รับเงิน |
| method | payment_method | ไม่ | | |
| deposit_account_id | uuid → company_bank_accounts | ได้ | FK RESTRICT | บัญชีที่รับเข้า |
| transfer_ref | text | ได้ | | เลขอ้างอิงการโอน |
| cheque_no, cheque_bank | text | ได้ | | |
| cheque_date | date | ได้ | | |
| amount_received | numeric(14,2) | ไม่ | CHECK > 0 | เงินที่ได้รับจริง |
| wht_rate | numeric(5,2) | ได้ | CHECK 0–15 | อัตราภาษีหัก ณ ที่จ่าย (FR-PAY-10) |
| wht_amount | numeric(14,2) | ไม่ | 0; CHECK ≥ 0 | |
| wht_certificate_no | text | ได้ | | เลขที่หนังสือรับรอง 50 ทวิ |
| fee_amount | numeric(14,2) | ไม่ | 0; CHECK ≥ 0 | ค่าธรรมเนียมที่ลูกค้าหัก |
| settled_amount | numeric(14,2) | ไม่ | GENERATED ALWAYS AS (amount_received + wht_amount + fee_amount) STORED | ยอดตัดหนี้ |
| status | record_status | ไม่ | `ACTIVE` | |
| reversed_at, reversed_by | | ได้ | | |
| reverse_reason | text | ได้ | NOT NULL เมื่อ REVERSED | |
| note | text | ได้ | | |
| + คอลัมน์มาตรฐาน | | | | |

Trigger: แก้ไขยอด/วันที่/ลูกค้าไม่ได้หลังมีใบเสร็จที่ออกแล้ว (BR-PAY-09); DELETE ไม่ได้

### T16 `payment_allocations`

| คอลัมน์ | ชนิด | Null | Constraint | คำอธิบาย |
|---|---|---|---|---|
| id | uuid | ไม่ | PK | |
| payment_id | uuid → payments | ไม่ | FK RESTRICT | |
| document_id | uuid → documents | ไม่ | FK RESTRICT | ต้องเป็น INV ที่ ISSUED ของลูกค้าเดียวกัน |
| amount | numeric(14,2) | ไม่ | CHECK > 0 | ยอดที่ตัดหนี้ INV นี้ |
| status | record_status | ไม่ | `ACTIVE` | |
| transferred_from_id | uuid → payment_allocations | ได้ | FK RESTRICT | กรณีย้ายจากฉบับเดิม (BR-INV-08) |
| created_at, created_by, reversed_at, reversed_by | | | | |

Unique: `(payment_id, document_id) WHERE status='ACTIVE'`; Index: `(document_id) WHERE status='ACTIVE'`

**Constraint trigger (DEFERRABLE INITIALLY DEFERRED) — ตรวจตอน COMMIT** (BR-PAY-02, BR-PAY-03, FR-PAY-08):

```sql
-- 1) ผลรวมการจัดสรร ACTIVE ของ payment = settled_amount (เมื่อ payment ACTIVE) หรือ 0 (เมื่อ REVERSED)
-- 2) ผลรวมการจัดสรร ACTIVE ของ INV ≤ documents.grand_total
-- 3) INV ต้อง doc_type='INV', lifecycle_status='ISSUED', customer_id ตรงกับ payment
-- และอัปเดต documents.payment_status จากผลรวม (BR-PAY-05)
-- ก่อนตรวจ service ทำ: SELECT id FROM documents WHERE id = ANY($inv_ids) ORDER BY id FOR UPDATE  (BR-PAY-04)
```

### T17 `tax_settings`

| คอลัมน์ | ชนิด | Null | Constraint | คำอธิบาย |
|---|---|---|---|---|
| id | uuid | ไม่ | PK | |
| tax_code | text | ไม่ | `VAT` | |
| rate | numeric(5,2) | ไม่ | CHECK 0–100 | 7.00 |
| effective_from | date | ไม่ | | |
| effective_to | date | ได้ | CHECK ≥ effective_from | NULL = ไม่มีกำหนดสิ้นสุด |
| legal_reference | text | ไม่ | | เช่น "พระราชกฤษฎีกาลดอัตรา VAT (ขยายถึง 30 ก.ย. 2570) — OI-T18" |
| rounding_mode | text | ไม่ | `HALF_UP` | ป.86/2542 ข้อ 2 |
| rounding_scale | int | ไม่ | 2 | |
| vat_calc_level | text | ไม่ | `DOCUMENT` | คิด VAT ระดับเอกสาร (TR-06) |
| + created_at, created_by | | | | |

```sql
-- ช่วงเวลาห้ามซ้อน (BR-TAX-04) — ต้องใช้ extension btree_gist
ALTER TABLE tax_settings ADD CONSTRAINT ex_tax_period EXCLUDE USING gist (
  tax_code WITH =, daterange(effective_from, coalesce(effective_to, 'infinity'), '[]') WITH &&);
```

Trigger: ห้ามแก้ `rate`/`effective_from` ของแถวที่มีเอกสารอ้างอิงแล้ว (แก้ได้เฉพาะ `effective_to` เพื่อปิดช่วง)

### T18 `document_files`

| คอลัมน์ | ชนิด | Null | Constraint | คำอธิบาย |
|---|---|---|---|---|
| id | uuid | ไม่ | PK | |
| purpose | file_purpose | ไม่ | | |
| document_id | uuid → documents | ได้ | FK RESTRICT | |
| variant | file_variant | ไม่ | `NONE` | |
| storage_bucket | text | ไม่ | | bucket แบบ private |
| storage_key | text | ไม่ | UNIQUE | เช่น `docs/2026/INV/INV-2026-0042_original_v1.pdf` |
| file_name | text | ไม่ | | ชื่อไฟล์ตอนดาวน์โหลด |
| mime_type | text | ไม่ | | |
| size_bytes | bigint | ไม่ | CHECK > 0 | |
| sha256 | char(64) | ไม่ | | ตรวจความถูกต้อง (FR-PDF-02) |
| template_version | text | ได้ | | |
| is_canonical | boolean | ไม่ | false | ไฟล์อ้างอิงของเอกสาร (1 ไฟล์ต่อ document+variant) |
| regenerated_from_id | uuid → document_files | ได้ | | กรณีต้องสร้างใหม่เพราะไฟล์เสีย |
| expires_at | timestamptz | ได้ | | ไฟล์ชั่วคราว (BATCH_PDF, REPORT_EXPORT) |
| created_at, created_by | | | | |

Unique: `(document_id, variant) WHERE is_canonical`; ไฟล์ canonical ห้าม UPDATE/DELETE

### T19 `audit_logs` (append-only)

| คอลัมน์ (ช่องตาม Spec) | ชนิด | Null | คำอธิบาย |
|---|---|---|---|
| id | bigint identity | ไม่ | PK เรียงลำดับ |
| occurred_at (**Timestamp**) | timestamptz | ไม่ | now() |
| actor_user_id (**User**) | uuid → users | ได้ | NULL = ระบบ (job) |
| actor_type | text | ไม่ | `USER` / `SYSTEM` |
| event_type (**Event Type**) | text | ไม่ | ตาม catalog §6 |
| entity_type | text | ไม่ | `document`, `payment`, `customer`, … |
| entity_id | uuid | ได้ | |
| document_id (**Document ID**) | uuid | ได้ | |
| related_document_id (**Related Document**) | uuid | ได้ | |
| previous_value (**Previous Value**) | jsonb | ได้ | เฉพาะช่องที่เปลี่ยน |
| new_value (**New Value**) | jsonb | ได้ | |
| reason (**Reason**) | text | ได้ | |
| request_id | uuid | ได้ | โยงหลายแถวที่มาจากคำสั่งเดียว |
| ip_address | inet | ได้ | |
| user_agent | text | ได้ | |
| prev_hash | char(64) | ได้ | hash ของแถวก่อนหน้า |
| row_hash | char(64) | ไม่ | SHA-256(prev_hash ‖ ข้อมูลแถวแบบมาตรฐาน) |

สิทธิ์: role ของแอปมีเฉพาะ `INSERT, SELECT`; trigger ปฏิเสธ UPDATE/DELETE/TRUNCATE (BR-AUD-03)
Index: `(document_id, occurred_at)`, `(entity_type, entity_id, occurred_at)`, `(event_type, occurred_at)`

### T20 `system_settings`

| คอลัมน์ | ชนิด | คำอธิบาย |
|---|---|---|
| key | text PK | |
| value | jsonb | |
| description | text | |
| updated_at, updated_by | | |

คีย์เริ่มต้น: `numbering.period_mode` (`CALENDAR`/`FISCAL`), `numbering.fiscal_year_start` (MM-DD), `numbering.formats` (ต่อประเภท), `display.year_era` (`BE`/`CE`), `document.defaults.{QT,DN,INV,RC}` (เงื่อนไข/หมายเหตุ), `tax.lock_date` (BR-DATE-07), `security.session_idle_minutes`, `backup.retention_policy`

### T21 `idempotency_keys`

| คอลัมน์ | ชนิด | คำอธิบาย |
|---|---|---|
| key | text PK | ส่งจากเบราว์เซอร์ (UUID) |
| scope | text | เช่น `document.issue` |
| request_hash | char(64) | ตรวจว่า payload เดิม |
| response | jsonb | ผลลัพธ์ที่ส่งกลับซ้ำได้ |
| created_at | timestamptz | |
| expires_at | timestamptz | ล้างหลัง 7 วัน |

### T22 `backup_runs`

| คอลัมน์ | ชนิด | คำอธิบาย |
|---|---|---|
| id | uuid PK | |
| run_type | text | `DB_BACKUP`, `FILE_SYNC`, `RESTORE_TEST`, `RESTORE_DRILL` |
| started_at, finished_at | timestamptz | |
| status | text | `RUNNING`, `SUCCESS`, `FAILED` |
| artifact_location | text | object key ของไฟล์สำรอง (ไม่ใช่ URL สาธารณะ) |
| size_bytes | bigint | |
| sha256 | char(64) | |
| verification | jsonb | ผลตรวจ: จำนวนแถว, ผลรวมยอดรายเดือน, ความต่อเนื่องเลขที่, hash ของ PDF สุ่ม |
| error | text | |

---

## 4. ความสัมพันธ์และกฎการลบ (Relationships & Delete Rules)

| ความสัมพันธ์ | Cardinality | ON DELETE | เหตุผล |
|---|---|---|---|
| companies 1 — n company_branches | 1:n | RESTRICT | ข้อมูลภาษี |
| companies 1 — n company_bank_accounts | 1:n | RESTRICT | ปิดใช้งานแทน |
| companies 1 — n customers / products / documents / payments | 1:n | RESTRICT | |
| customers 1 — n customer_branches | 1:n | RESTRICT | ถูกอ้างอิงจากเอกสาร |
| customers 1 — n customer_contacts | 1:n | CASCADE | ข้อมูลติดต่อ ไม่ใช่หลักฐาน (เอกสารมี snapshot) |
| customers 1 — n documents | 1:n | RESTRICT | BR-CU-05 |
| products 1 — n document_items | 1:n (optional) | RESTRICT | FR-PR-10 |
| products 1 — n product_price_history | 1:n | RESTRICT | ประวัติถาวร |
| documents 1 — n document_items | 1:n | CASCADE + trigger อนุญาตเฉพาะร่าง | ร่างลบได้ |
| documents n — n documents (ผ่าน document_links) | n:n | RESTRICT | สายเอกสาร |
| documents 1 — n document_revisions | 1:n | RESTRICT | |
| documents 1 — n document_files | 1:n | RESTRICT | |
| document_sequences 1 — n documents | 1:n | RESTRICT | |
| payments 1 — n payment_allocations | 1:n | RESTRICT | กลับรายการแทนการลบ |
| documents(INV) 1 — n payment_allocations | 1:n | RESTRICT | |
| payments 1 — 0..1 documents(RC) | 1:1 | RESTRICT | ใบเสร็จต่อการรับชำระ |
| tax_settings 1 — n documents | 1:n | RESTRICT | |
| users 1 — n (created_by, …) | 1:n | RESTRICT | ปิดใช้งานผู้ใช้แทนการลบ |

สรุป: **ไม่มี CASCADE ใดลบข้อมูลที่ออกแล้ว** — CASCADE มีเฉพาะ `customer_contacts` และ `document_items` ของร่าง

## 5. แนวทางป้องกันข้อมูลชนกัน (Concurrency)

| สถานการณ์ | วิธีป้องกัน | กฎ |
|---|---|---|
| ออกเลขพร้อมกัน | Row lock บน `document_sequences` + unique index | BR-NUM-03, 04 |
| กดออกเอกสารซ้ำ | `idempotency_keys` + `SELECT … FOR UPDATE` ตัวเอกสาร + ตรวจ DRAFT | BR-DOC-06 |
| รับชำระพร้อมกันสองหน้าต่าง | Lock แถว INV ตามลำดับ id + constraint trigger ตอน commit | BR-PAY-04 |
| แก้ข้อมูลลูกค้า/สินค้าในสองแท็บ | `row_version` (optimistic) — แจ้ง "ข้อมูลถูกแก้จากที่อื่น" | — |
| ระดับ isolation | `READ COMMITTED` + lock ชัดเจนในจุดวิกฤต (ง่ายและคาดเดาได้) | — |

## 6. Audit Event Catalog

| Event Type | เมื่อใด | Previous/New Value | Reason |
|---|---|---|---|
| `AUTH.LOGIN_SUCCEEDED` / `AUTH.LOGIN_FAILED` / `AUTH.LOGOUT` | เข้า/ออกระบบ | — | — |
| `AUTH.PASSWORD_CHANGED` / `AUTH.MFA_ENABLED` | เปลี่ยนความปลอดภัย | — | — |
| `COMPANY.UPDATED` / `BRANCH.*` / `BANK_ACCOUNT.*` | แก้ข้อมูลกิจการ | ช่องที่เปลี่ยน | ได้ |
| `CUSTOMER.CREATED` / `UPDATED` / `DEACTIVATED` | | ช่องที่เปลี่ยน | ได้ |
| `PRODUCT.CREATED` / `UPDATED` / `PRICE_CHANGED` / `DEACTIVATED` | | ช่องที่เปลี่ยน | ได้ |
| `DOCUMENT.DRAFT_CREATED` / `DRAFT_SAVED` / `DRAFT_DELETED` | ร่าง | diff | — |
| `DOCUMENT.CREATED_FROM` | สร้างต่อจากต้นทาง | — | เหตุผลสร้างซ้ำ (ถ้ามี) |
| `DOCUMENT.ISSUED` | ออก | สถานะ, เลขที่ | — |
| `DOCUMENT.DATE_WARNING_ACKNOWLEDGED` | ยืนยันคำเตือนวันที่ (BR-DATE-03) | วันที่ | ได้ |
| `DOCUMENT.CANCELLED` / `SUPERSEDED` | ยกเลิก/ถูกแทน | สถานะ | **บังคับ** |
| `DOCUMENT.ORIGINAL_RETURNED` | ได้ต้นฉบับคืน | — | — |
| `DOCUMENT.REPLACEMENT_COPY_ISSUED` | ออกใบแทน (ม.86/12) | ครั้งที่ | **บังคับ** |
| `DOCUMENT.PDF_GENERATED` / `PDF_REGENERATED` | สร้างไฟล์ | sha256 | (regenerate: บังคับ) |
| `DOCUMENT.PRINTED` / `DOWNLOADED` | พิมพ์/ดาวน์โหลด | variant | ต้นฉบับซ้ำ: บังคับ (BR-PRT-02) |
| `PAYMENT.RECORDED` / `REVERSED` | รับชำระ/กลับรายการ | ยอด, allocation | reverse: บังคับ |
| `ALLOCATION.TRANSFERRED` | ย้ายการจัดสรรไปฉบับแทน | — | — |
| `SETTINGS.UPDATED` / `TAX_SETTING.CREATED` / `NUMBERING.FORMAT_CHANGED` | ตั้งค่า | ค่าเดิม/ใหม่ | ได้ |
| `REPORT.EXPORTED` | export | ชนิด, ช่วงวันที่ | — |
| `BACKUP.COMPLETED` / `BACKUP.FAILED` / `RESTORE_TEST.*` | งานระบบ | — | — |

## 7. Snapshot Strategy

| ข้อมูล | เก็บที่ | เมื่อใด | เหตุผล |
|---|---|---|---|
| ผู้ขาย (บริษัท + สาขาที่ออก + บัญชีธนาคาร + ผู้ลงนาม + โลโก้) | `documents.seller_snapshot` (jsonb) | ตอนออก | แก้ข้อมูลกิจการแล้วเอกสารเก่าไม่เปลี่ยน (FR-CO-07) |
| ไฟล์โลโก้/ลายเซ็น | `document_files` แบบไม่เขียนทับ — snapshot เก็บ file id + sha256 | ตอนออก | สร้าง PDF ซ้ำได้เหมือนเดิม |
| ผู้ซื้อ | คอลัมน์ `buyer_*` | ตั้งแต่ร่าง (ล็อกตอนออก) | ค้นหา/รายงานได้เร็ว + แก้เฉพาะเอกสารได้ |
| รายการสินค้า | `document_items` | ตั้งแต่ร่าง (ล็อกตอนออก) | FR-PR-07 |
| ภาษีและการคำนวณ | `vat_rate`, `tax_setting_id`, `price_mode`, ยอดทุกขั้น, `calc_engine_version` | ตอนออก | คำนวณซ้ำได้และตรวจย้อนหลังได้ |
| แม่แบบ | `template_version` | ตอนออก | BR-PRT-04 |
| ทั้งเอกสาร | `document_revisions` (event ISSUED) + `content_hash` | ตอนออก | หลักฐานว่าไม่ถูกแก้ |
| ไฟล์ PDF | `document_files` canonical + sha256 | หลังออก | พิมพ์ซ้ำไม่เปลี่ยน (FR-DOC-12) |

**ทำไมผู้ซื้อเป็นคอลัมน์ แต่ผู้ขายเป็น jsonb:** ผู้ซื้อถูกใช้ค้นหา/กรอง/รายงานภาษีขาย (ชื่อ, เลขผู้เสียภาษี, สาขา) จึงต้อง index ได้; ผู้ขายใช้เพื่อพิมพ์เท่านั้น และโครงสร้างอาจเพิ่มช่องในอนาคต

## 8. Views สำหรับรายงาน (สรุป)

| View | ใช้กับ | เกณฑ์ |
|---|---|---|
| `v_sales_invoices` | FR-RPT-01…05, Dashboard | INV ที่ ISSUED (ไม่รวม CANCELLED/SUPERSEDED) ตาม doc_date |
| `v_sales_tax_report` | FR-RPT-08 | INV ทุกสถานะที่มีเลข เรียงเลขที่ รายเดือน + หมายเหตุยกเลิก/แทน (BR-RPT-05) |
| `v_ar_open_items` | FR-RPT-07, FR-DSH-04/06/07 | INV ISSUED ที่คงเหลือ > 0 + อายุหนี้ + overdue (BR-PAY-06) |
| `v_payments_received` | FR-RPT-06, FR-DSH-03 | payments ACTIVE ตาม payment_date |
| `v_sales_by_product` | FR-RPT-05 | document_items ของ INV: net_amount − doc_discount_alloc |
| `v_cancelled_documents` | FR-RPT-09 | เอกสาร CANCELLED/SUPERSEDED ทุกประเภท + เหตุผล |

## 9. Data Retention

| ข้อมูล | ระยะเก็บที่เสนอ | ขั้นต่ำตามกฎหมาย (ต้องยืนยัน OI-T14) | หมายเหตุ |
|---|---|---|---|
| เอกสารที่ออกแล้ว + รายการ + revision ISSUED | ≥ 10 ปี (ค่าเริ่มต้น: ไม่ลบ) | สำเนาใบกำกับภาษีและรายงานภาษี ≥ 5 ปี (ม.87/3, อาจขยายถึง 7 ปีตามที่อธิบดีกำหนด); เอกสารบัญชี ≥ 5 ปี (พ.ร.บ.การบัญชี) | ขนาดข้อมูลเล็ก เก็บได้ไม่จำกัด |
| ไฟล์ PDF canonical | ≥ 10 ปี | เช่นเดียวกัน | เก็บใน storage + สำเนาสำรอง |
| Audit logs | ≥ 10 ปี | — | หลักฐานตรวจสอบ |
| การรับชำระ/การจัดสรร | ≥ 10 ปี | ≥ 5 ปี | |
| Revision ของร่างที่ไม่เคยออก | 1 ปีหลังลบร่าง | — | |
| ไฟล์ชั่วคราว (PDF รวม, export) | 24 ชม. – 7 วัน | — | `expires_at` |
| `idempotency_keys` | 7 วัน | — | |
| ข้อมูลผู้ติดต่อ (ข้อมูลส่วนบุคคล) | ตราบที่ยังเป็นลูกค้า; ลบ/ปิดบังได้เมื่อเลิกติดต่อ — แต่ข้อมูลใน snapshot เอกสารภาษีเก็บตามกฎหมาย | PDPA: ฐานหน้าที่ตามกฎหมาย (ต้องยืนยัน — OI-L01) | |
| Backup | รายวัน 35 วัน, รายเดือน 24 เดือน, รายปี 10 ปี | — | `11_SECURITY_BACKUP.md` §6 |

## 10. การตรวจความถูกต้องย้อนหลัง (Integrity Verification)

งานตรวจประจำคืน (บันทึกผลใน `backup_runs.verification` หรือ audit):
1. เลขที่ต่อเนื่องในทุก `document_sequences` (BR-NUM-09)
2. `content_hash` ของเอกสาร ISSUED ตรงกับการคำนวณใหม่จาก snapshot (สุ่ม 100 ฉบับ/คืน + ทั้งหมดเดือนละครั้ง)
3. SHA-256 ของไฟล์ PDF canonical ตรงกับค่าในตาราง (สุ่ม)
4. ผลรวมการจัดสรรต่อ INV ≤ grand_total และ `payment_status` ตรงกับผลรวม
5. Hash chain ของ `audit_logs` ต่อเนื่อง
6. คำนวณ Tax Engine ซ้ำกับเอกสารที่ออกแล้ว (สุ่ม) ต้องได้ยอดเท่าเดิม
