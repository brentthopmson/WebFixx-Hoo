# WebFixx Ecosystem Architecture

This document outlines the interconnected components of the WebFixx ecosystem and how they communicate.

## Core Components

### 1. Frontend: **WebFixx**
- **Path**: `DEV\App\WEBFIXX\webfixx`
- **Tech Stack**: Next.js
- **Role**: The main user interface for the application. It communicates with the `WebFixx-Hoo` backend API.

### 2. Backend Proxy & API: **WebFixx-Hoo**
- **Path**: `DEV\Extra Tools\WebFixx-Hoo`
- **Tech Stack**: Python (Flask)
- **Role**: Acts as a gateway/proxy. It handles routing for templating, Web3 operations, and delegates business logic to the Google Apps Script project.

### 3. Logic Layer: **Google Apps Script (GAS)**
- **Path**: `DEV\Extra Tools\WebFixx-Hoo\google-apps-script`
- **Link**: [Script ID: 1MbpD9...](https://script.google.com/d/1MbpD9AJrN-wwN2zTFRbK7xusrCN8A_mSAHvy86Q0gJ7bFtUPhjLIE8f4/edit)
- **Spreadsheet**: [ID: 17cjaHx9...](https://docs.google.com/spreadsheets/d/17cjaHx93z3ciGAdgJ4AvkjgIwI9gP3RsfJU5G7exp-U/edit)
- **Role**: Handles data persistence (Google Sheets), authentication, and complex business workflows.

### 4. Serverless/Headless Engine: **offline-headless-webfixx**
- **Path**: `DEV\API\offline-headless-webfixx`
- **Role**: Provides serverless functions and headless browser capabilities. It is called by the Google Apps Script project for specialized tasks.

### 5. API Consumers / Client Projects
- **Recession-HTML**: `DEV\App\WEBFIXX\Recession-HTML`
- **CRF-HTML**: `DEV\App\WEBFIXX\CRF-HTML`
- **Role**: Specialized versions or clients that consume the `WebFixx-Hoo` API.

## Communication Flow

1.  **User** interacts with the **WebFixx Frontend**.
2.  Frontend makes requests to **WebFixx-Hoo (Flask)**.
3.  WebFixx-Hoo proxies relevant logic to the **Google Apps Script** via the `APPSCRIPT_URL`.
4.  **Google Apps Script** performs database operations on **Google Sheets** and, if needed, calls **offline-headless-webfixx** for serverless processing.
5.  Results are returned back through the chain to the User.

## Graphify Status
- **Instance**: Initialized in `WebFixx-Hoo`.
- **Scope**: Currently mapping `WebFixx-Hoo` (Python) and its internal `google-apps-script` (JS).
- **AST Nodes**: 323
- **Edges**: 694 (AST) + 637 (Semantic)
