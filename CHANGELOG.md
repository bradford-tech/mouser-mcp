# Changelog

## [0.0.5](https://github.com/bradford-tech/mouser-mcp/compare/mouser-mcp-v0.0.4...mouser-mcp-v0.0.5) (2026-11-04)


### Bug Fixes

* say datasheet links appear only when Mouser provides them ([3771cda](https://github.com/bradford-tech/mouser-mcp/commit/3771cda7b851aadb1e5a127c6f226abd3bd87da3))

## [0.0.4](https://github.com/bradford-tech/mouser-mcp/compare/mouser-mcp-v0.0.3...mouser-mcp-v0.0.4) (2026-11-03)


### Bug Fixes

* **deps:** depend on mouser-sdk ~0.0.2 (0.0.1 was unpublished) ([313fdc3](https://github.com/bradford-tech/mouser-mcp/commit/313fdc3133ab28e77d706dd8bc8aa41d0f2a98bc))

## [0.0.3](https://github.com/bradford-tech/mouser-mcp/compare/mouser-mcp-v0.0.2...mouser-mcp-v0.0.3) (2026-11-03)


### Bug Fixes

* keep release-please's manifest.json formatting from failing CI ([250c081](https://github.com/bradford-tech/mouser-mcp/commit/250c0817cdbab1af99430316e6580753bf661472))

## [0.0.2](https://github.com/bradford-tech/mouser-mcp/compare/mouser-mcp-v0.0.1...mouser-mcp-v0.0.2) (2026-11-03)


### Features

* cart, order information and order history tools ([6e06275](https://github.com/bradford-tech/mouser-mcp/commit/6e06275795ec2d259dfe6fbaecceff0ade9aa283))
* Mouser MCP server with APPROVE-confirmed ordering ([bc4bba7](https://github.com/bradford-tech/mouser-mcp/commit/bc4bba7e123df302b9fc98dcf07c90e327383a5f))
* opt-in order preview and APPROVE-confirmed submission ([0c36367](https://github.com/bradford-tech/mouser-mcp/commit/0c36367a51b20ee9cba92feb0711084afd161cd0))
* rate limiter and Mouser call wrapper ([45201dc](https://github.com/bradford-tech/mouser-mcp/commit/45201dc6aaaaf46b353807873c7a8dd88a702db8))
* require page-aligned offsets for manufacturer searches ([745ebca](https://github.com/bradford-tech/mouser-mcp/commit/745ebcacafe54ed0ce9a171a36bc63215e1125b4))
* say nothing was submitted when the daily limit blocks an order ([f88ae31](https://github.com/bradford-tech/mouser-mcp/commit/f88ae31759b232ff6d0c351c15720840040264f0))
* search tools with compact part summaries and BOM batching ([c231ca9](https://github.com/bradford-tech/mouser-mcp/commit/c231ca961b0570fa60a0ea2d65bd7a4287f3c1f2))
* serve the confirmation prompt to 2025-era clients that declare elicitation ([da73a39](https://github.com/bradford-tech/mouser-mcp/commit/da73a39ad4ef1f7c7ffd56377b19a98f748b2308))
* stdio entry point, tool surface checks and live check ([a7a1146](https://github.com/bradford-tech/mouser-mcp/commit/a7a114635eca6972416860c634ccf2691d70023b))


### Bug Fixes

* accept APPROVE only in reply to a server-issued prompt; flag unconfirmed submits ([9517b73](https://github.com/bradford-tech/mouser-mcp/commit/9517b73aff765fa39dd64cccf5f83b0f5e09b38c))
* get_parts keeps results from good batches and reports failed ones ([6688de5](https://github.com/bradford-tech/mouser-mcp/commit/6688de556f3e5bfc06db74cbe2d4061dee4fa124))
