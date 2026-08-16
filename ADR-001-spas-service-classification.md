# ADR-001 — SPAS Classification of smartinsight-ai-api

Status: Proposed
Architecture Standard: SPAS v1.0

## Context
The current service exposes a manuscript-oriented `/ai-review` endpoint that fetches a PDF, extracts manuscript text, and requests a structured editorial/reviewer response from an AI provider. The service is therefore specialized to scholarly publishing rather than being a generic portfolio AI platform.

## Decision
1. `smartinsight-ai-api` is classified as a **Legacy Scholarly AI Adapter / SSPA migration candidate**.
2. It is **not** the SmartInsight Platform Services AI Gateway.
3. Scholarly review logic, manuscript prompts, submission identifiers, and publication-specific processing belong to the scholarly/SSPA domain unless a later ADR extracts a genuinely reusable provider abstraction.
4. A future Shared AI Gateway must be product-agnostic and own only reusable concerns such as provider routing, model policy, request metering, safety controls, observability, quotas, credential resolution, and generic execution contracts.
5. Product-specific prompts, editorial decisions, manuscript parsing policy, and domain scoring must remain outside the shared gateway.
6. No direct migration is performed until SSPA integration boundaries and security requirements are mapped.

## Security gate before reuse
Before this service is reused or exposed as a production integration, it must have explicit authentication/authorization, controlled outbound URL retrieval or a trusted storage contract, request-size/rate limits, provider timeout/retry controls, structured error handling, audit/observability, and secret-management controls.

## Consequence
The existence of this API does not justify creating a shared AI platform around its current code. Reusable infrastructure may be extracted later after domain-specific behavior is separated.
