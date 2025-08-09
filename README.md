# coin-calculate-app-ui


### Running process with pnpm:
```
pnpm install
```

### Compiles and hot-reloads for development
```
pnpm run serve
```

### npm+docker run process:
```
docker build -t sg-vue-ui .
docker run -d --name vueui -p 80:80 sg-vue-ui

```



### Customize configuration
See [Configuration Reference](https://cli.vuejs.org/config/).



----- 1) Mektup Tipleri
CREATE TABLE ref_letter_request_type (
    id SMALLINT PRIMARY KEY,
    name VARCHAR(50) NOT NULL UNIQUE
);
-- PK zaten id'yi indexler
-- UNIQUE(name) indexi de rapor/sorgu hızlandırır
CREATE INDEX idx_ref_letter_request_type_name ON ref_letter_request_type(name);

INSERT INTO ref_letter_request_type (id, name) VALUES
(1, 'ODEME'),
(2, 'HAKEDIS_DEVIR'),
(3, 'DAVET');

-------------------------------------------------

-- 2) Scope Tipleri
CREATE TABLE ref_letter_scope (
    id SMALLINT PRIMARY KEY,
    name VARCHAR(50) NOT NULL UNIQUE
);
CREATE INDEX idx_ref_letter_scope_name ON ref_letter_scope(name);

INSERT INTO ref_letter_scope (id, name) VALUES
(1, 'BULK'),
(2, 'SINGLE'),


-------------------------------------------------

-- 3) Status Tipleri
CREATE TABLE ref_letter_status (
    id SMALLINT PRIMARY KEY,
    name VARCHAR(50) NOT NULL UNIQUE
);
CREATE INDEX idx_ref_letter_status_name ON ref_letter_status(name);

INSERT INTO ref_letter_status (id, name) VALUES
(1, 'PENDING'),
(2, 'VALIDATION_FAIL'),
(3, 'READY'),
(4, 'PROCESSING'),
(5, 'PARTIAL_SENT'),
(6, 'SENT'),
(7, 'FAILED'),
(8, 'CANCELLED');
------------------------------------------------------------------


CREATE TABLE letter_request (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Lookup tablolarına FK
    request_type_id         SMALLINT NOT NULL REFERENCES ref_letter_request_type(id),
    scope_id                SMALLINT NOT NULL REFERENCES ref_letter_scope(id),
    scope_value             VARCHAR(20),

    -- Zorunlu alanlar
    first_payment_date      DATE     NOT NULL,
    last_payment_date       DATE     NOT NULL,

    -- Opsiyonel alanlar (ekrandan gelebilecek)
    tahakkuk_turu           VARCHAR(50),
    belge_no                VARCHAR(50),
    yil                     INTEGER,
    karar_no_adi            VARCHAR(200),
    firma_vkn               VARCHAR(20),
    uretici_tckn            VARCHAR(20),
    ihracatci_unvan         VARCHAR(250),
    mektup_tipi_ui          VARCHAR(100),

    -- Durum
    status_id               SMALLINT NOT NULL REFERENCES ref_letter_status(id),

    -- Audit bilgileri
    created_by              VARCHAR(64) NOT NULL,
    branch_id               VARCHAR(32) NOT NULL,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updater                 VARCHAR(64),

    -- Gönderim deneme bilgileri
    attempt_count           SMALLINT NOT NULL DEFAULT 0,
    last_attempt_at         TIMESTAMPTZ,
    next_attempt_at         TIMESTAMPTZ,
    processing_started_at   TIMESTAMPTZ,
    processing_finished_at  TIMESTAMPTZ,
    processing_duration_ms  INTEGER,

    -- Hata bilgileri
    last_error_code         VARCHAR(64),
    last_error_message      TEXT,

    -- Bildirim
    notify_emails           TEXT,
    notify_sent             BOOLEAN NOT NULL DEFAULT FALSE,
    notify_sent_at          TIMESTAMPTZ,
    notify_to_list          TEXT
) PARTITION BY RANGE (created_at);


ilk partition elle oluşturulu sonra job oluşturacak. her ayın son ünü 23.55 de çalışan job bir sonraki ayın partitionını oluşturacak
CREATE TABLE letter_request_2025_08 PARTITION OF letter_request
FOR VALUES FROM ('2025-08-01') TO ('2025-09-01');

CREATE INDEX idx_letter_request_2025_08_status_next
    ON letter_request_2025_08 (status_id, next_attempt_at);
	
	
	
	created_at üzerinden RANGE partition yapıldığı için Spring Boot job’unda gelecek ayın ilk günü → sonraki ayın ilk günü aralığında partisyon oluşturuyoruz.

Lookup tablolar (ref_letter_request_type, ref_letter_scope, ref_letter_status) SMALLINT PK olarak tanımlı.

(status_id, next_attempt_at) index’i her yeni partisyona eklenmeli (job bunu otomatik yapacak).

job--kodu----------
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.List;

@Service
@RequiredArgsConstructor
public class PartitionService {

    private final JdbcTemplate jdbcTemplate;

    /**
     * Gelecek ay için RANGE partition oluşturur.
     * @param baseTable    Ana tablo ismi (ör: letter_request)
     * @param column       Partition RANGE sütunu (ör: created_at)
     * @param indexColumns Bu partisyona eklenecek index kolonları
     */
    public void createNextMonthRangePartition(String baseTable, String column, List<String> indexColumns) {
        LocalDate startDate = LocalDate.now().withDayOfMonth(1).plusMonths(1);
        LocalDate endDate = startDate.plusMonths(1);

        String partitionName = String.format("%s_%s",
                baseTable, startDate.format(DateTimeFormatter.ofPattern("yyyy_MM")));

        // Partisyon var mı kontrol et
        String checkSql = """
            SELECT EXISTS (
                SELECT 1
                FROM pg_class c
                JOIN pg_namespace n ON n.oid = c.relnamespace
                WHERE c.relkind = 'r'
                  AND n.nspname = 'public'
                  AND c.relname = ?
            )
            """;

        Boolean exists = jdbcTemplate.queryForObject(checkSql, Boolean.class, partitionName);

        if (Boolean.FALSE.equals(exists)) {
            // CREATE TABLE PARTITION
            String createSql = String.format("""
                CREATE TABLE %s PARTITION OF %s
                FOR VALUES FROM ('%s') TO ('%s');
                """, partitionName, baseTable, startDate, endDate);
            jdbcTemplate.execute(createSql);

            // Index ekle
            if (indexColumns != null && !indexColumns.isEmpty()) {
                for (String col : indexColumns) {
                    String indexSql = String.format("""
                        CREATE INDEX ON %s (%s);
                        """, partitionName, col);
                    jdbcTemplate.execute(indexSql);
                }
            }

            System.out.printf("Partition %s created for %s - %s%n", partitionName, startDate, endDate);
        } else {
            System.out.printf("Partition %s already exists.%n", partitionName);
        }
    }
}


import lombok.RequiredArgsConstructor;
import net.javacrumbs.shedlock.spring.annotation.SchedulerLock;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class PartitionScheduler {

    private final PartitionService partitionService;

    // Her ayın son günü saat 23:55'te çalışır
    @Scheduled(cron = "0 55 23 L * *")
    @SchedulerLock(
        name = "createNextMonthPartitions",
        lockAtLeastFor = "PT1M", // en az 1 dakika kilit
        lockAtMostFor = "PT10M" // en fazla 10 dakika kilit
    )
    public void createNextMonthPartitions() {
        // letter_request → created_at RANGE partition
        partitionService.createNextMonthRangePartition(
                "letter_request",
                "created_at",
                List.of("status_id, next_attempt_at")
        );

        // letter_attempt → started_at RANGE partition
        partitionService.createNextMonthRangePartition(
                "letter_attempt",
                "started_at",
                List.of("request_id", "item_id", "started_at")
        );

        // letter_notification_log → sent_at RANGE partition
        partitionService.createNextMonthRangePartition(
                "letter_notification_log",
                "sent_at",
                List.of("request_id", "sent_at")
        );
    }
}




---------------------------------

CREATE TABLE letter_item (
    id                BIGSERIAL PRIMARY KEY,
    request_id        UUID NOT NULL REFERENCES letter_request(id) ON DELETE CASCADE,
    receiver_key      VARCHAR(64) NOT NULL,
    payload_ref       VARCHAR(200),
    status_id         SMALLINT NOT NULL REFERENCES ref_letter_status(id),
    attempt_count     SMALLINT NOT NULL DEFAULT 0,
    last_error_code   VARCHAR(64),
    last_error_message TEXT,
    sent_at           TIMESTAMPTZ,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
) PARTITION BY HASH (request_id);


CREATE TABLE letter_attempt (
    id              BIGSERIAL PRIMARY KEY,
    request_id      UUID NOT NULL REFERENCES letter_request(id) ON DELETE CASCADE,
    item_id         BIGINT REFERENCES letter_item(id) ON DELETE CASCADE,
    attempt_no      SMALLINT NOT NULL,
    started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    finished_at     TIMESTAMPTZ,
    duration_ms     INTEGER,
    result          VARCHAR(20) NOT NULL, -- SUCCESS / FAIL
    error_code      VARCHAR(64),
    error_message   TEXT
) PARTITION BY RANGE (started_at);


CREATE TABLE letter_notification_log (
    id           BIGSERIAL PRIMARY KEY,
    request_id   UUID REFERENCES letter_request(id) ON DELETE CASCADE,
    to_emails    TEXT NOT NULL,
    subject      TEXT,
    sent_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    provider_id  VARCHAR(100),
    status       VARCHAR(20)
) PARTITION BY RANGE (sent_at);




------------------------------------ tek script-------------

-- ========================================
-- 1) Lookup Tablolar
-- ========================================
CREATE TABLE ref_letter_request_type (
    id SMALLINT PRIMARY KEY,
    name VARCHAR(50) NOT NULL UNIQUE
);
INSERT INTO ref_letter_request_type (id, name) VALUES
(1, 'ODEME'),
(2, 'HAKEDIS_DEVIR'),
(3, 'DAVET');

CREATE TABLE ref_letter_scope (
    id SMALLINT PRIMARY KEY,
    name VARCHAR(50) NOT NULL UNIQUE
);
INSERT INTO ref_letter_scope (id, name) VALUES
(1, 'BULK'),
(2, 'SINGLE');

CREATE TABLE ref_letter_status (
    id SMALLINT PRIMARY KEY,
    name VARCHAR(50) NOT NULL UNIQUE
);
INSERT INTO ref_letter_status (id, name) VALUES
(1, 'PENDING'),
(2, 'VALIDATION_FAIL'),
(3, 'READY'),
(4, 'PROCESSING'),
(5, 'PARTIAL_SENT'),
(6, 'SENT'),
(7, 'FAILED'),
(8, 'CANCELLED');

-- ========================================
-- 2) letter_request (RANGE partition)
-- ========================================
CREATE TABLE letter_request (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_type_id         SMALLINT NOT NULL REFERENCES ref_letter_request_type(id),
    scope_id                SMALLINT NOT NULL REFERENCES ref_letter_scope(id),
    scope_value             VARCHAR(20),
    first_payment_date      DATE NOT NULL,
    last_payment_date       DATE NOT NULL,
    tahakkuk_turu           VARCHAR(50),
    belge_no                VARCHAR(50),
    yil                     INTEGER,
    karar_no_adi            VARCHAR(200),
    firma_vkn               VARCHAR(20),
    uretici_tckn            VARCHAR(20),
    ihracatci_unvan         VARCHAR(250),
    mektup_tipi_ui          VARCHAR(100),
    status_id               SMALLINT NOT NULL REFERENCES ref_letter_status(id),
    created_by              VARCHAR(64) NOT NULL,
    branch_id               VARCHAR(32) NOT NULL,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updater                 VARCHAR(64),
    attempt_count           SMALLINT NOT NULL DEFAULT 0,
    last_attempt_at         TIMESTAMPTZ,
    next_attempt_at         TIMESTAMPTZ,
    processing_started_at   TIMESTAMPTZ,
    processing_finished_at  TIMESTAMPTZ,
    processing_duration_ms  INTEGER,
    last_error_code         VARCHAR(64),
    last_error_message      TEXT,
    notify_emails           TEXT,
    notify_sent             BOOLEAN NOT NULL DEFAULT FALSE,
    notify_sent_at          TIMESTAMPTZ,
    notify_to_list          TEXT
) PARTITION BY RANGE (created_at);

-- Örnek ilk partisyon (bu ay)
CREATE TABLE letter_request_2025_08 PARTITION OF letter_request
FOR VALUES FROM ('2025-08-01') TO ('2025-09-01');
CREATE INDEX idx_letter_request_2025_08_status_next
    ON letter_request_2025_08 (status_id, next_attempt_at);

-- ========================================
-- 3) letter_item (HASH partition)
-- ========================================
CREATE TABLE letter_item (
    id                BIGSERIAL PRIMARY KEY,
    request_id        UUID NOT NULL REFERENCES letter_request(id) ON DELETE CASCADE,
    receiver_key      VARCHAR(64) NOT NULL,
    payload_ref       VARCHAR(200),
    status_id         SMALLINT NOT NULL REFERENCES ref_letter_status(id),
    attempt_count     SMALLINT NOT NULL DEFAULT 0,
    last_error_code   VARCHAR(64),
    last_error_message TEXT,
    sent_at           TIMESTAMPTZ,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
) PARTITION BY HASH (request_id);

-- 8 HASH partition
DO $$
BEGIN
    FOR i IN 0..7 LOOP
        EXECUTE format(
            'CREATE TABLE letter_item_p%s PARTITION OF letter_item
             FOR VALUES WITH (MODULUS 8, REMAINDER %s);', i, i
        );
        EXECUTE format(
            'CREATE INDEX idx_letter_item_p%s_req_status
             ON letter_item_p%s (request_id, status_id);', i, i
        );
    END LOOP;
END$$;

-- ========================================
-- 4) letter_attempt (RANGE partition)
-- ========================================
CREATE TABLE letter_attempt (
    id              BIGSERIAL PRIMARY KEY,
    request_id      UUID NOT NULL REFERENCES letter_request(id) ON DELETE CASCADE,
    item_id         BIGINT REFERENCES letter_item(id) ON DELETE CASCADE,
    attempt_no      SMALLINT NOT NULL,
    started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    finished_at     TIMESTAMPTZ,
    duration_ms     INTEGER,
    result          VARCHAR(20) NOT NULL, -- SUCCESS / FAIL
    error_code      VARCHAR(64),
    error_message   TEXT
) PARTITION BY RANGE (started_at);

-- Örnek ilk partisyon (bu ay)
CREATE TABLE letter_attempt_2025_08 PARTITION OF letter_attempt
FOR VALUES FROM ('2025-08-01') TO ('2025-09-01');
CREATE INDEX idx_letter_attempt_2025_08_req ON letter_attempt_2025_08 (request_id);
CREATE INDEX idx_letter_attempt_2025_08_item ON letter_attempt_2025_08 (item_id);
CREATE INDEX idx_letter_attempt_2025_08_start ON letter_attempt_2025_08 (started_at);

-- ========================================
-- 5) letter_notification_log (RANGE partition)
-- ========================================
CREATE TABLE letter_notification_log (
    id           BIGSERIAL PRIMARY KEY,
    request_id   UUID REFERENCES letter_request(id) ON DELETE CASCADE,
    to_emails    TEXT NOT NULL,
    subject      TEXT,
    sent_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    provider_id  VARCHAR(100),
    status       VARCHAR(20)
) PARTITION BY RANGE (sent_at);

-- Örnek ilk partisyon (bu ay)
CREATE TABLE letter_notification_log_2025_08 PARTITION OF letter_notification_log
FOR VALUES FROM ('2025-08-01') TO ('2025-09-01');
CREATE INDEX idx_letter_notification_log_2025_08_req ON letter_notification_log_2025_08 (request_id);
CREATE INDEX idx_letter_notification_log_2025_08_sent ON letter_notification_log_2025_08 (sent_at);


----------------------h2

-- =========================
-- Lookup Tables
-- =========================
CREATE TABLE IF NOT EXISTS ref_letter_request_type (
    id SMALLINT PRIMARY KEY,
    name VARCHAR(50) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS ref_letter_scope (
    id SMALLINT PRIMARY KEY,
    name VARCHAR(50) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS ref_letter_status (
    id SMALLINT PRIMARY KEY,
    name VARCHAR(50) NOT NULL UNIQUE
);

-- =========================
-- Main Tables
-- =========================
CREATE TABLE IF NOT EXISTS letter_request (
    id UUID PRIMARY KEY,
    request_type_id SMALLINT NOT NULL REFERENCES ref_letter_request_type(id),
    scope_id SMALLINT NOT NULL REFERENCES ref_letter_scope(id),
    scope_value VARCHAR(20),
    first_payment_date DATE NOT NULL,
    last_payment_date DATE NOT NULL,
    tahakkuk_turu VARCHAR(50),
    belge_no VARCHAR(50),
    yil INTEGER,
    karar_no_adi VARCHAR(200),
    firma_vkn VARCHAR(20),
    uretici_tckn VARCHAR(20),
    ihracatci_unvan VARCHAR(250),
    mektup_tipi_ui VARCHAR(100),
    status_id SMALLINT NOT NULL REFERENCES ref_letter_status(id),
    created_by VARCHAR(64) NOT NULL,
    branch_id VARCHAR(32) NOT NULL,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL,
    updater VARCHAR(64),
    attempt_count SMALLINT NOT NULL DEFAULT 0,
    last_attempt_at TIMESTAMP,
    next_attempt_at TIMESTAMP,
    processing_started_at TIMESTAMP,
    processing_finished_at TIMESTAMP,
    processing_duration_ms INTEGER,
    last_error_code VARCHAR(64),
    last_error_message TEXT,
    notify_emails TEXT,
    notify_sent BOOLEAN NOT NULL DEFAULT FALSE,
    notify_sent_at TIMESTAMP,
    notify_to_list TEXT
);

CREATE INDEX IF NOT EXISTS idx_letter_request_status_next_attempt 
    ON letter_request(status_id, next_attempt_at);

-- =========================
-- Letter Attempt Table
-- =========================
CREATE TABLE IF NOT EXISTS letter_attempt (
    id UUID PRIMARY KEY,
    request_id UUID NOT NULL,
    item_id UUID,
    started_at TIMESTAMP NOT NULL,
    finished_at TIMESTAMP,
    status_id SMALLINT NOT NULL REFERENCES ref_letter_status(id),
    error_code VARCHAR(64),
    error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_letter_attempt_req_item_start 
    ON letter_attempt(request_id, item_id, started_at);

-- =========================
-- Letter Notification Log
-- =========================
CREATE TABLE IF NOT EXISTS letter_notification_log (
    id UUID PRIMARY KEY,
    request_id UUID NOT NULL,
    sent_at TIMESTAMP NOT NULL,
    recipient_email VARCHAR(255) NOT NULL,
    status_id SMALLINT NOT NULL REFERENCES ref_letter_status(id),
    error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_letter_notification_log_req_sent 
    ON letter_notification_log(request_id, sent_at);

-- =========================
-- Letter Item Table (Hash Partition Simülasyonu Yok)
-- =========================
CREATE TABLE IF NOT EXISTS letter_item (
    id UUID PRIMARY KEY,
    request_id UUID NOT NULL,
    content TEXT,
    status_id SMALLINT NOT NULL REFERENCES ref_letter_status(id),
    created_at TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_letter_item_status 
    ON letter_item(status_id);

-- =========================
-- Seed Data (Optional)
-- =========================
INSERT INTO ref_letter_request_type (id, name) VALUES
(1, 'ODEME'),
(2, 'HAKEDIS_DEVIR'),
(3, 'DAVET')
ON DUPLICATE KEY UPDATE name = VALUES(name);

INSERT INTO ref_letter_scope (id, name) VALUES
(1, 'BULK'),
(2, 'SINGLE')
ON DUPLICATE KEY UPDATE name = VALUES(name);

INSERT INTO ref_letter_status (id, name) VALUES
(1, 'PENDING'),
(2, 'VALIDATION_FAIL'),
(3, 'READY'),
(4, 'PROCESSING'),
(5, 'PARTIAL_SENT'),
(6, 'SENT'),
(7, 'FAILED'),
(8, 'CANCELLED')
ON DUPLICATE KEY UPDATE name = VALUES(name);


spring.datasource.url=jdbc:h2:mem:testdb;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DEFAULT_NULL_ORDERING=HIGH
spring.datasource.driver-class-name=org.h2.Driver
spring.datasource.username=sa
spring.datasource.password=
spring.h2.console.enabled=true

spring.sql.init.mode=always
spring.sql.init.schema-locations=classpath:schema-h2.sql
spring.jpa.hibernate.ddl-auto=none



