-- =====================================================================
-- CampusEats -- Database Schema Sketch (Task 5)
-- Each block belongs to exactly ONE service. Foreign keys only ever
-- point at a table inside the SAME service. Cross-service references
-- (columns ending in _ref) are stored as plain opaque values -- never
-- as a foreign key into another service's table -- so the boundary
-- rule ("no table belongs to two services") holds.
-- =====================================================================

-- ---------------------------------------------------------------------
-- IDENTITY & ACCESS SERVICE
-- ---------------------------------------------------------------------
CREATE TABLE Users (
    user_id        INT PRIMARY KEY,
    name           VARCHAR(100)  NOT NULL,
    email          VARCHAR(150)  NOT NULL UNIQUE,
    password_hash  VARCHAR(255)  NOT NULL,
    phone          VARCHAR(20),
    role           ENUM('student', 'restaurant', 'admin') NOT NULL,
    is_active      BOOLEAN       NOT NULL DEFAULT TRUE,
    created_at     TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE Addresses (
    address_id       INT PRIMARY KEY,
    user_id          INT NOT NULL,
    label            VARCHAR(50),
    building_hostel  VARCHAR(100),
    room_or_landmark VARCHAR(150),
    campus_zone      VARCHAR(100),
    FOREIGN KEY (user_id) REFERENCES Users(user_id)
);

-- ---------------------------------------------------------------------
-- CATALOGUE SERVICE
-- ---------------------------------------------------------------------
CREATE TABLE Restaurants (
    restaurant_id   INT PRIMARY KEY,
    owner_user_ref  INT NOT NULL,        -- opaque ref to Identity Service, not an FK
    name            VARCHAR(150) NOT NULL,
    campus_zone     VARCHAR(100),
    contact_phone   VARCHAR(20),
    is_open         BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE Categories (
    category_id    INT PRIMARY KEY,
    restaurant_id  INT NOT NULL,
    name           VARCHAR(100) NOT NULL,
    FOREIGN KEY (restaurant_id) REFERENCES Restaurants(restaurant_id)
);

CREATE TABLE FoodItems (
    item_id        INT PRIMARY KEY,
    restaurant_id  INT NOT NULL,
    category_id    INT NOT NULL,
    name           VARCHAR(150) NOT NULL,
    description    TEXT,
    price          DECIMAL(10,2) NOT NULL,
    is_available   BOOLEAN NOT NULL DEFAULT TRUE,
    FOREIGN KEY (restaurant_id) REFERENCES Restaurants(restaurant_id),
    FOREIGN KEY (category_id)   REFERENCES Categories(category_id)
);

-- ---------------------------------------------------------------------
-- CART SERVICE
-- ---------------------------------------------------------------------
CREATE TABLE Carts (
    cart_id     INT PRIMARY KEY,
    user_ref    INT NOT NULL,            -- opaque ref to Identity Service
    status      ENUM('active', 'checked_out') NOT NULL DEFAULT 'active',
    created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE CartItems (
    cart_item_id         INT PRIMARY KEY,
    cart_id              INT NOT NULL,
    item_ref             INT NOT NULL,   -- opaque ref to Catalogue Service
    item_name_snapshot   VARCHAR(150) NOT NULL,
    unit_price_snapshot  DECIMAL(10,2) NOT NULL,
    quantity             INT NOT NULL CHECK (quantity > 0),
    FOREIGN KEY (cart_id) REFERENCES Carts(cart_id)
);

-- ---------------------------------------------------------------------
-- ORDER SERVICE
-- ---------------------------------------------------------------------
CREATE TABLE Orders (
    order_id                    INT PRIMARY KEY,
    user_ref                    INT NOT NULL,   -- opaque ref to Identity Service
    restaurant_ref               INT NOT NULL,   -- opaque ref to Catalogue Service
    delivery_address_snapshot   VARCHAR(255) NOT NULL,
    total_amount                DECIMAL(10,2) NOT NULL,
    status  ENUM('placed','accepted','preparing','out_for_delivery','delivered','cancelled') NOT NULL DEFAULT 'placed',
    placed_at                   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE OrderItems (
    order_item_id        INT PRIMARY KEY,
    order_id              INT NOT NULL,
    item_ref              INT NOT NULL,  -- opaque ref to Catalogue Service
    item_name_snapshot    VARCHAR(150) NOT NULL,
    unit_price_snapshot   DECIMAL(10,2) NOT NULL,
    quantity              INT NOT NULL CHECK (quantity > 0),
    FOREIGN KEY (order_id) REFERENCES Orders(order_id)
);

CREATE TABLE OrderStatusHistory (
    history_id      INT PRIMARY KEY,
    order_id        INT NOT NULL,
    status          VARCHAR(30) NOT NULL,
    changed_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    changed_by_ref  INT,                -- opaque ref (student, restaurant, or admin)
    FOREIGN KEY (order_id) REFERENCES Orders(order_id)
);

-- ---------------------------------------------------------------------
-- PAYMENT SERVICE
-- ---------------------------------------------------------------------
CREATE TABLE Payments (
    payment_id  INT PRIMARY KEY,
    order_ref   INT NOT NULL,           -- opaque ref to Order Service
    amount      DECIMAL(10,2) NOT NULL,
    method      ENUM('wallet', 'card', 'upi') NOT NULL,
    status      ENUM('authorized', 'failed', 'refunded') NOT NULL,
    created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE PaymentTransactions (
    transaction_id      INT PRIMARY KEY,
    payment_id          INT NOT NULL,
    gateway_ref         VARCHAR(100),
    transaction_status  VARCHAR(30),
    timestamp           TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (payment_id) REFERENCES Payments(payment_id)
);

-- ---------------------------------------------------------------------
-- NOTIFICATION SERVICE
-- ---------------------------------------------------------------------
CREATE TABLE Notifications (
    notification_id  INT PRIMARY KEY,
    user_ref          INT NOT NULL,     -- opaque ref to Identity Service
    type              VARCHAR(50) NOT NULL,
    message           TEXT NOT NULL,
    status            ENUM('sent', 'failed') NOT NULL DEFAULT 'sent',
    sent_at           TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
