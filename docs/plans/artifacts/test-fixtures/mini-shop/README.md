# mini-shop fixture

Small multi-file codebase for semantic `codebase_search` testing.

## Areas in this fixture
- authentication: password hashing and verification
- sessions: token issuance and rotation metadata
- orders: invoice totals, tax calculation, retry scheduling for payment failures
- cache: TTL-enabled LRU cache for expensive lookups

## Example semantic queries
- Where are passwords hashed and verified?
- How does payment retry with exponential backoff work?
- Where is invoice tax calculation implemented?
- How does the in-memory TTL cache evict entries?
