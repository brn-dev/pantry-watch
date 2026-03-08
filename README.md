# Pantry Watch

AI-powered grocery best-before date tracker.

## App Flow

- User creates household
- User creates one or more locations for household
- User enters items manually or via voice recording
- Voice is transcribed and transformed by an LLM into structured output
- Items are listed per location, ordered by best-before date
- Highlighting:
  - green: more than 1 week
  - yellow: less than 1 week
  - red: less than 3 days
  - purple: past best-before date

## Schema (excl Users)

**Household**:
* name: string
* joinCode: string
* locations: Location[]

**Location**:
* name: string
* household: Household
* items: Item[]

**Item**:
* name: string
* bestBeforeDate: Date/Null
* location: Location
