from neo4j import GraphDatabase

URI = "neo4j+s://679ede24.databases.neo4j.io"
AUTH = ("679ede24", "664HbwFtGcpSk6I_Oof-hNGGfjIbKCWII2cyuvU4HUU")

driver = GraphDatabase.driver(URI, auth=AUTH)

with driver.session() as session:
    result = session.run("RETURN 1 AS test")
    print(result.single()["test"])

driver.close()
// tab