# System Architecture Diagram
**Project Name:** e-Prashikshan 2.0 (LMS)
**Classification:** Internal / Confidential

This document provides a high-level architectural overview of the e-Prashikshan 2.0 system. It maps the flow of data from the client interfaces through the security and middleware layers, into the core business logic, and finally to the persistent data storage.

```mermaid
graph TD
    %% Client Layer
    subgraph Client Layer [Client Application Layer]
        AdminUI[Admin Dashboard<br/>React/Vite]
        TeacherUI[Instructor Portal<br/>React/Vite]
        StudentUI[Learner Portal<br/>React/Vite]
        MobileApp[Mobile Application<br/>Planned Phase]
    end

    %% Network & Entry Layer
    subgraph Edge Layer [Edge & Network Layer]
        Proxy[Reverse Proxy / Load Balancer<br/>Nginx/Cloudflare]
    end

    %% Backend Application Layer
    subgraph App Layer [Backend Application Layer - Node.js / Express]
        
        %% Middleware
        subgraph Middleware [Security & Interception Middleware]
            RateLimit[Rate Limiters<br/>Brute-Force Protection]
            JWTAuth[Authentication Middleware<br/>JWT Validation]
            RBAC[RBAC Middleware<br/>Contextual Policy Resolution]
        end

        %% Controllers/Services
        subgraph Services [Core Business Services]
            AuthSvc[Identity & Auth Service<br/>OTP, Login, MFA]
            UserSvc[User Management Service<br/>Profiles, Bulk Import]
            CourseSvc[Curriculum Service<br/>Courses, Lectures]
            EnrollSvc[Enrollment Service<br/>State Workflows]
            AuditSvc[Compliance Service<br/>System Audit Logs]
            RoleSvc[Policy Service<br/>Custom Roles/Permissions]
        end
    end

    %% Persistence Layer
    subgraph Data Layer [Persistence Data Layer - MongoDB]
        DB[(MongoDB Cluster)]
        
        %% Collections
        ColUser[Users & Profiles<br/>Collection]
        ColCourse[Courses & Content<br/>Collection]
        ColRBAC[Roles & Permissions<br/>Collection]
        ColEnroll[Enrollments<br/>Collection]
        ColAudit[Audit Logs<br/>Collection]
        ColSec[Security Tokens<br/>OTP, Device, Recovery]
    end

    %% External Integrations
    subgraph External [External Services]
        SMTP[SMTP Server<br/>Email Verification/Recovery]
        CloudStorage[Cloud Storage<br/>Planned for Multimedia]
        Payment[Payment Gateway<br/>Planned]
    end

    %% Relationships - Client to Edge
    AdminUI -->|HTTPS/REST| Proxy
    TeacherUI -->|HTTPS/REST| Proxy
    StudentUI -->|HTTPS/REST| Proxy
    MobileApp -.->|HTTPS/REST| Proxy

    %% Edge to App
    Proxy -->|Forward Request| RateLimit
    
    %% Middleware Flow
    RateLimit --> JWTAuth
    JWTAuth --> RBAC
    RBAC --> AuthSvc
    RBAC --> UserSvc
    RBAC --> CourseSvc
    RBAC --> EnrollSvc
    RBAC --> AuditSvc
    RBAC --> RoleSvc

    %% App to External
    AuthSvc -->|Send Emails| SMTP
    CourseSvc -.->|Store Assets| CloudStorage
    EnrollSvc -.->|Process Fee| Payment

    %% Services to DB
    AuthSvc -->|Read/Write| DB
    UserSvc -->|Read/Write| DB
    CourseSvc -->|Read/Write| DB
    EnrollSvc -->|Read/Write| DB
    AuditSvc -->|Write Only| DB
    RoleSvc -->|Read/Write| DB

    %% DB to Collections mapping
    DB --- ColUser
    DB --- ColCourse
    DB --- ColRBAC
    DB --- ColEnroll
    DB --- ColAudit
    DB --- ColSec

    %% Styling
    classDef client fill:#e1f5fe,stroke:#01579b,stroke-width:2px;
    classDef edge fill:#fff3e0,stroke:#e65100,stroke-width:2px;
    classDef middleware fill:#fce4ec,stroke:#880e4f,stroke-width:2px;
    classDef service fill:#e8f5e9,stroke:#1b5e20,stroke-width:2px;
    classDef db fill:#f3e5f5,stroke:#4a148c,stroke-width:2px;
    classDef external fill:#eceff1,stroke:#263238,stroke-width:2px,stroke-dasharray: 5 5;

    class AdminUI,TeacherUI,StudentUI,MobileApp client;
    class Proxy edge;
    class RateLimit,JWTAuth,RBAC middleware;
    class AuthSvc,UserSvc,CourseSvc,EnrollSvc,AuditSvc,RoleSvc service;
    class DB,ColUser,ColCourse,ColRBAC,ColEnroll,ColAudit,ColSec db;
    class SMTP,CloudStorage,Payment external;
```
