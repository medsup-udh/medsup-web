# 05 — ER Diagram

> สถานะ: Phase 0 — ร่างเพื่อตรวจรับ
> รายละเอียดคอลัมน์และ constraint ทั้งหมด: `04_DATABASE_DESIGN.md` (แผนภาพนี้แสดงเฉพาะคอลัมน์สำคัญ)
> ภาพรวมแบบรูปภาพ (ไม่ต้องใช้ Mermaid): [`05_ER_DIAGRAM_overview.svg`](05_ER_DIAGRAM_overview.svg) / [`.png`](05_ER_DIAGRAM_overview.png)

สัญลักษณ์: `||--o{` = หนึ่งต่อศูนย์หรือหลาย, `||--||` = หนึ่งต่อหนึ่ง, `|o--o{` = ศูนย์หรือหนึ่งต่อศูนย์หรือหลาย

## 1. ภาพรวมความสัมพันธ์ทั้งหมด

```mermaid
erDiagram
    companies ||--o{ company_branches : "has"
    companies ||--o{ company_bank_accounts : "has"
    companies ||--o{ customers : "sells to"
    companies ||--o{ products : "offers"
    companies ||--o{ documents : "issues"
    companies ||--o{ payments : "receives"
    company_branches ||--o{ documents : "issuing branch"
    company_branches ||--o{ document_sequences : "numbering per branch"
    customers ||--o{ customer_branches : "billing locations"
    customers ||--o{ customer_contacts : "contacts"
    customers ||--o{ documents : "buyer"
    customers ||--o{ payments : "pays"
    customer_branches |o--o{ documents : "billed to"
    products |o--o{ document_items : "optional (ad-hoc = none)"
    products ||--o{ product_price_history : "price log"
    documents ||--o{ document_items : "lines"
    documents ||--o{ document_links : "source"
    documents ||--o{ document_links : "target"
    documents ||--o{ document_revisions : "revisions"
    documents ||--o{ document_files : "pdf files"
    documents |o--o{ product_price_history : "price source"
    document_sequences ||--o{ documents : "running number"
    tax_settings ||--o{ documents : "vat rate"
    payments ||--o{ payment_allocations : "split into"
    documents ||--o{ payment_allocations : "invoice paid by"
    payments ||--o| documents : "receipt RC"
    users ||--o{ audit_logs : "actor"
    documents |o--o{ audit_logs : "about"
```

## 2. ข้อมูลหลัก (Master Data)

```mermaid
erDiagram
    companies {
        uuid id PK
        text name_th
        text name_en
        char13 tax_id UK
        text addr_line
        uuid logo_file_id FK
        text signatory_name
        jsonb doc_display
    }
    company_branches {
        uuid id PK
        uuid company_id FK
        branch_type branch_type
        char5 branch_code "00000 = head office"
        text name
        boolean is_default
    }
    company_bank_accounts {
        uuid id PK
        uuid company_id FK
        text bank_name
        text account_no
        boolean show_on_documents
    }
    customers {
        uuid id PK
        uuid company_id FK
        text customer_code UK
        customer_type customer_type
        text name_th
        char13 tax_id
        boolean is_vat_registered
        int default_credit_days
    }
    customer_branches {
        uuid id PK
        uuid customer_id FK
        branch_type branch_type
        char5 branch_code
        text addr_line
        boolean is_default
    }
    customer_contacts {
        uuid id PK
        uuid customer_id FK
        text name
        text phone
        text email
    }
    products {
        uuid id PK
        uuid company_id FK
        text product_code UK
        text name
        text unit
        tax_category default_tax_category
        numeric latest_price "cache, no stock column"
    }
    product_price_history {
        uuid id PK
        uuid product_id FK
        numeric unit_price
        price_mode price_mode
        numeric unit_price_ex_vat
        uuid document_id FK
        uuid customer_id FK
        date effective_date
    }
    companies ||--o{ company_branches : "has"
    companies ||--o{ company_bank_accounts : "has"
    companies ||--o{ customers : "has"
    companies ||--o{ products : "has"
    customers ||--o{ customer_branches : "has"
    customers ||--o{ customer_contacts : "has"
    products ||--o{ product_price_history : "logs"
```

## 3. เอกสาร การรับชำระ และการตรวจสอบ

```mermaid
erDiagram
    documents {
        uuid id PK
        uuid company_branch_id FK
        doc_type doc_type "QT DN INV RC"
        lifecycle_status lifecycle_status
        payment_status payment_status
        text doc_no UK "null while draft"
        uuid sequence_id FK
        int running_no
        date doc_date
        date due_date
        uuid customer_id FK
        text buyer_name "snapshot"
        char13 buyer_tax_id "snapshot"
        char5 buyer_branch_code "snapshot"
        jsonb seller_snapshot
        price_mode price_mode
        numeric vat_rate
        numeric vatable_base
        numeric vat_amount
        numeric grand_total
        uuid payment_id FK "RC only"
        uuid replaces_document_id FK
        char64 content_hash
    }
    document_items {
        uuid id PK
        uuid document_id FK
        int line_no
        uuid product_id FK "null = ad-hoc"
        text item_name "snapshot"
        numeric quantity
        numeric unit_price
        numeric net_amount
        numeric doc_discount_alloc
        tax_category tax_category
        uuid source_item_id FK
    }
    document_links {
        uuid id PK
        uuid source_document_id FK
        uuid target_document_id FK
        link_type link_type
    }
    document_sequences {
        uuid id PK
        uuid company_branch_id FK
        doc_type doc_type
        text period_key "2026 or FY2027"
        int last_number
        date last_doc_date
    }
    document_revisions {
        uuid id PK
        uuid document_id FK
        int revision_no
        text event
        jsonb snapshot
        char64 snapshot_hash
    }
    document_files {
        uuid id PK
        uuid document_id FK
        file_purpose purpose
        file_variant variant
        text storage_key UK
        char64 sha256
        boolean is_canonical
    }
    tax_settings {
        uuid id PK
        numeric rate
        date effective_from
        date effective_to
        text legal_reference
    }
    payments {
        uuid id PK
        uuid customer_id FK
        date payment_date
        payment_method method
        numeric amount_received
        numeric wht_amount
        numeric fee_amount
        numeric settled_amount "generated"
        record_status status
    }
    payment_allocations {
        uuid id PK
        uuid payment_id FK
        uuid document_id FK "INV"
        numeric amount
        record_status status
    }
    audit_logs {
        bigint id PK
        timestamptz occurred_at
        uuid actor_user_id FK
        text event_type
        uuid document_id
        uuid related_document_id
        jsonb previous_value
        jsonb new_value
        text reason
        char64 row_hash
    }
    users {
        uuid id PK
        citext email UK
        text display_name
        user_role role
    }
    documents ||--o{ document_items : "lines"
    documents ||--o{ document_links : "links"
    documents ||--o{ document_revisions : "revisions"
    documents ||--o{ document_files : "files"
    document_sequences ||--o{ documents : "numbers"
    tax_settings ||--o{ documents : "rate"
    payments ||--o{ payment_allocations : "allocations"
    documents ||--o{ payment_allocations : "paid by"
    payments ||--o| documents : "receipt"
    users ||--o{ audit_logs : "actor"
```

## 4. ตารางสนับสนุน (ไม่มีความสัมพันธ์บังคับ)

| ตาราง | หน้าที่ |
|---|---|
| `system_settings` | key–value ตั้งค่า |
| `idempotency_keys` | กันคำสั่งซ้ำ |
| `backup_runs` | ผลสำรอง/ทดสอบกู้คืน |

## 5. จุดที่ควรสังเกตในแผนภาพ

1. **`documents` เป็นตารางเดียวสำหรับ 4 ประเภท** — ใช้ `doc_type` แยก ทำให้สายเอกสาร, การค้นหา, audit, PDF ใช้โครงสร้างเดียวกัน คอลัมน์เฉพาะประเภท (เช่น `valid_until`, `payment_id`) ใช้ CHECK บังคับตามประเภท
2. **`document_links` เป็น n:n** — ใบเสนอราคาหนึ่งใบมีใบส่งของได้หลายใบ และใบกำกับภาษีหนึ่งใบอาจรวมหลายใบส่งของได้
3. **`payment_allocations` เป็นตัวกลางระหว่างการรับเงินกับใบกำกับภาษี** — รับเงินหนึ่งครั้งตัดได้หลายใบ ใบหนึ่งรับได้หลายครั้ง (FR-PAY-07)
4. **ใบเสร็จ (RC) ผูกกับ `payments` แบบ 1:1** — ไม่ผูกกับใบกำกับภาษีโดยตรง แต่เห็นได้ผ่าน allocations
5. **`products` ไม่มีคอลัมน์สต็อก** ตามขอบเขต (FR-PR-09)
