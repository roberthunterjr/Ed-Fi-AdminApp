# PRD: Ed-Fi Certification Automation Platform

**Owner:** Robert H on behalf of Nathan G  
**Status:** Draft  
**Last Updated:** 2026-07-29

---

# Overview

The Ed-Fi Certification Automation Platform is a hosted platform designed to modernize and automate Ed-Fi certification workflows while replacing operational processes currently supported through the legacy Sandbox Admin experience.

The platform provides a unified experience for:

- Vendor onboarding
- Certification environment provisioning
- Credential management
- SIS certification workflows
- Domain API certification workflows
- Validation and reporting
- Reviewer approval workflows

The platform builds upon the Admin App and Admin API foundation, extending administrative capabilities into certification lifecycle management.

---

# Purpose and Strategic Alignment

## Strategic Goals

The Certification Automation Platform supports the following objectives:

- Reduce certification onboarding time
- Reduce operational effort required by Ed-Fi staff
- Improve vendor certification experience
- Accelerate certification completion
- Improve consistency of certification validation
- Enable certification expansion into new domains and standards versions

## Administrative Tooling Alignment

The platform extends ongoing investments in:

- Admin App
- Admin API
- Credential Management
- Environment Provisioning
- Hosted Ed-Fi Infrastructure

Rather than operating as a standalone certification tool, certification becomes an extension of Ed-Fi administrative tooling.

## Market-Led Growth Alignment

Improving certification supports broader Ed-Fi adoption goals by:

- Reducing vendor integration costs
- Shortening implementation timelines
- Improving certification scalability
- Increasing partner satisfaction

---

# Target Market

## Primary Audience

### Certified Vendors

Organizations seeking certification against Ed-Fi APIs.

### Vendor Engineering Teams

Engineers implementing and validating Ed-Fi integrations.

### Ed-Fi Certification Staff

Staff responsible for:

- Certification management
- Validation
- Review
- Approval

## Future Audiences

Future deployment patterns may support:

- State Education Agencies (SEAs)
- Education Service Agencies (ESAs)
- Managed Service Providers (MSPs)
- Data Hub operators

---

# Personas

## Vendor Certification Administrator

### Primary Motivations

- Register products
- Manage certification submissions
- Monitor certification progress

### Success Looks Like

- Minimal waiting on Ed-Fi staff
- Clear certification status
- Self-service management

---

## Vendor Integration Engineer

### Primary Motivations

- Validate Ed-Fi integrations
- Understand certification requirements
- Resolve certification issues quickly

### Success Looks Like

- Immediate feedback
- Clear validation failures
- Guided certification workflow

---

## Certification Reviewer

### Primary Motivations

- Validate submissions
- Ensure certification quality
- Reduce manual effort

### Success Looks Like

- Standardized evidence
- Efficient review process
- Consistent certification decisions

---

## Ed-Fi Platform Administrator

### Primary Motivations

- Provision environments
- Manage tenants
- Manage credentials
- Support certification infrastructure

### Success Looks Like

- Automated provisioning
- Reduced operational overhead
- Repeatable deployment processes

---

# Jobs To Be Done

## JTBD 1: Obtain Certification Environment

**When** a vendor begins certification,

**I want** a certification environment provisioned automatically,

**So that** I can immediately begin testing.

### Signals of Success

- Environment created automatically
- Credentials generated automatically
- Vendor access assigned automatically

---

## JTBD 2: Complete SIS Certification

**When** I am certifying my product,

**I want** a guided certification workflow,

**So that** I understand exactly what must be completed.

### Signals of Success

- Scenario status tracking
- Automated validation
- Certification progress visibility

---

## JTBD 3: Complete Domain API Certification

**When** I select one or more domains to certify,

**I want** the platform to identify required resources and endpoints,

**So that** I understand my certification scope.

### Signals of Success

- Endpoint coverage identified
- Required resources identified
- Certification readiness visible

---

## JTBD 4: Submit Certification Evidence

**When** I complete validation activities,

**I want** to submit certification artifacts in a standardized format,

**So that** reviewers can efficiently evaluate my certification.

### Signals of Success

- Consistent evidence structure
- Reduced back-and-forth communication
- Faster review cycles

---

## JTBD 5: Review Certification Submission

**When** a vendor submits certification,

**I want** a consistent set of artifacts and validation results,

**So that** I can confidently approve or reject certification.

### Signals of Success

- Reduced manual investigation
- Standardized review process
- Faster certification decisions

---

# Scope

## SIS Certification

### SIS v5

Migration of SIS v4 certification scenarios to Data Standard v5.

### SIS v6

Next-generation SIS certification scenarios aligned with Data Standard v6.

---

## Domain API Certification

### Domain API v5

Certification of resources and endpoints within Data Standard v5 domains.

### Domain API v6

Certification of resources and endpoints within Data Standard v6 domains.

---

# Must Have Features

## FT1: Automated Environment Provisioning

### Goal

Automatically provision:

- Vendors
- Tenants
- ODS Instances
- Applications
- Credentials

### Conditions of Satisfaction

- Vendor can begin testing immediately
- Credentials are generated automatically
- Reviewer can assign environments

---

## FT2: SIS Certification Workflow

### Goal

Provide guided execution of SIS certification scenarios.

### Conditions of Satisfaction

- Workflow progression tracked
- Validation performed automatically
- Progress status visible

---

## FT3: Domain API Certification Workflow

### Goal

Enable certification against selected domains.

### Conditions of Satisfaction

- Required resources identified
- Required endpoints identified
- Certification requirements visible

### Open Questions

- Should certification be driven by domain resources?
- Should certification be driven by endpoint coverage?
- Should certification be driven by sample data?

---

## FT4: Certification Artifact Management

### Goal

Provide management of:

- Product mappings
- Reports
- Sample data
- Validation results

### Conditions of Satisfaction

Reviewers can compare:

- Mappings
- Sample data
- Reports
- API responses

using a common structure.

---

## FT5: Validation Engine

### Goal

Validate:

- Endpoints
- Resources
- Data structures
- Required fields
- Data types

### Conditions of Satisfaction

Validation results are actionable and understandable.

---

## FT6: Reviewer Workbench

### Goal

Support certification review workflows.

### Conditions of Satisfaction

Reviewers can:

- Review artifacts
- Execute spot checks
- Leave feedback
- Approve certifications

---

## FT7: Certification Status Tracking

### Goal

Provide end-to-end certification visibility.

### Conditions of Satisfaction

Users can identify:

- Current status
- Failed validations
- Pending actions
- Reviewer feedback

---

# Future Enhancements

## Certification Registry Integration

Automated publication of certification results.

## Vendor Self-Service Registration

Allow vendors to create and manage certification accounts.

## Automated Re-Certification

Support certification renewal workflows.

## Certification APIs

Provide Admin API endpoints for certification operations.

## Deployable Certification Packages

Support deployment by:

- Data Hubs
- SEAs
- ESAs
- MSPs

## State-Specific Certification Programs

Enable state-level certification extensions.

---

# Non-Functional Requirements

## Security

- Secure credential generation
- Audit logging
- Role-based authorization
- Tenant isolation

## Scalability

- Support concurrent certification activities
- Support multiple active environments

## Extensibility

- Additional certification types
- Additional Data Standard versions
- Domain expansion

## Maintainability

- Scenario updates should not require code changes where possible
- Validation rules should be versioned

---

# Enterprise Architecture

## Core Components

### Admin App

Provides administrative interface and provisioning workflows.

### Admin API

Provides automation and platform integration.

### Certification Platform

Coordinates certification workflows.

### Validation Engine

Executes automated validations.

### Artifact Store

Stores:

- Mappings
- Reports
- Sample Data
- Validation Results

### Hosted Certification Infrastructure

Provides certification-specific environments.

---

# Open Questions

| ID | Question |
|------|------|
| OQ1 | Should Domain API automation be driven by sample data? |
| OQ2 | Do Admin and Security databases require isolated environments? |
| OQ3 | What is the authoritative source of certification definitions? |
| OQ4 | Can certification definitions be generated from Data Standard metadata? |
| OQ5 | Should vendors self-register? |
| OQ6 | How much semantic validation can be automated? |
| OQ7 | What is the standard format for mappings, reports, and sample data? |
| OQ8 | Should certification artifacts support CSV, JSON, or both? |

---

# Success Metrics

## Operational Metrics

- Reduction in certification provisioning time
- Reduction in reviewer effort
- Reduction in certification support requests

## Vendor Metrics

- Faster certification completion
- Improved vendor satisfaction
- Reduced certification remediation cycles

## Platform Metrics

- Increased certification throughput
- Reduced dependency on Sandbox Admin
- Increased automation coverage

---

# Appendix A: Potential Architecture Decisions

The following decisions require further investigation:

1. Certification Artifact Model
2. Scenario Definition Framework
3. Domain Metadata Management
4. Certification Registry Integration
5. Shared vs Isolated Environment Model
6. Admin App / Admin API Integration Boundaries

---

# Appendix B: Glossary

| Term | Description |
|--------|-------------|
| Certification Run | A single vendor certification attempt. |
| Certification Artifact | Mapping, report, sample data, or validation result submitted during certification. |
| Domain Certification | Certification against one or more Ed-Fi domains. |
| SIS Certification | Certification against SIS workflows and scenarios. |
| Validation Engine | Component responsible for executing automated certification checks. |
