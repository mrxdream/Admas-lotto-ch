import { useEffect, useState } from "react";

import {
  Alert,
  AlertIcon,
  Badge,
  Box,
  Button,
  FormControl,
  FormLabel,
  Heading,
  HStack,
  Input,
  Select,
  Spinner,
  Table,
  TableContainer,
  Tbody,
  Td,
  Text,
  Th,
  Thead,
  Tr,
  VStack,
} from "@chakra-ui/react";

import { apiRequest } from "../lib/api";

type Prize = {
  id: string;
  prizeName: string;
  winningNumber: string;
  prizeAmount: string | number | null;
  currency: string;
  sortOrder: number;
};

type Draw = {
  id: string;
  drawCode: string;
  drawDateText: string;
  status: "DRAFT" | "VERIFIED" | "PUBLISHED";
  prizes: Prize[];
};

type DrawResponse = Draw[] | { draws: Draw[] };

type PrizeEntriesPageProps = {
  initialSelectedDrawId?: string;
};

export default function PrizeEntriesPage({
  initialSelectedDrawId = "",
}: PrizeEntriesPageProps) {
  const [draws, setDraws] = useState<Draw[]>([]);

  // Initialize directly from the selected draw ID.
  const [selectedDrawId, setSelectedDrawId] = useState(initialSelectedDrawId);

  const [prizeName, setPrizeName] = useState("");
  const [winningNumber, setWinningNumber] = useState("");
  const [prizeAmount, setPrizeAmount] = useState("");
  const [currency, setCurrency] = useState("ETB");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function loadDraws() {
    setLoading(true);
    setError("");

    try {
      const response = await apiRequest<DrawResponse>("/api/admin/draws");

      const records = Array.isArray(response) ? response : response.draws;

      setDraws(records);

      // The selected draw from Draw Management takes priority.
      if (
        initialSelectedDrawId &&
        records.some((draw) => draw.id === initialSelectedDrawId)
      ) {
        setSelectedDrawId(initialSelectedDrawId);
      } else {
        setSelectedDrawId((current) => {
          // Preserve the current selection if it still exists.
          if (records.some((draw) => draw.id === current)) {
            return current;
          }

          // Otherwise select the first draft draw.
          return (
            records.find((draw) => draw.status === "DRAFT")?.id ??
            records[0]?.id ??
            ""
          );
        });
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not load lottery draws.",
      );
    } finally {
      setLoading(false);
    }
  }

  // Reload when the selected draw changes.
  useEffect(() => {
    void loadDraws();
    // The component is also keyed by selectedDrawId in App.tsx.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSelectedDrawId]);

  const selectedDraw = draws.find((draw) => draw.id === selectedDrawId);

  async function handleAddPrize(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setError("");
    setSuccess("");

    if (!selectedDraw) {
      setError("Please select a lottery draw.");
      return;
    }

    if (selectedDraw.status !== "DRAFT") {
      setError("Prize entries can only be added to draft draws.");
      return;
    }

    if (!prizeName.trim() || !winningNumber.trim()) {
      setError("Prize name and winning number are required.");
      return;
    }

    if (
      prizeAmount.trim() &&
      (!Number.isFinite(Number(prizeAmount)) || Number(prizeAmount) < 0)
    ) {
      setError("Enter a valid, non-negative prize amount.");
      return;
    }

    setSaving(true);

    try {
      await apiRequest(`/api/admin/draws/${selectedDraw.id}/prizes`, {
        method: "POST",
        body: {
          prizeName: prizeName.trim(),
          winningNumber: winningNumber.trim(),
          ...(prizeAmount.trim() ? { prizeAmount: Number(prizeAmount) } : {}),
          currency,
          sortOrder: selectedDraw.prizes.length,
        },
      });

      setPrizeName("");
      setWinningNumber("");
      setPrizeAmount("");

      await loadDraws();

      setSuccess("Prize entry saved to the database.");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not save the prize entry.",
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <HStack py={10} justify="center">
        <Spinner />
        <Text>Loading draws from the database...</Text>
      </HStack>
    );
  }

  return (
    <VStack align="stretch" spacing={6}>
      <Box className="panel-card">
        <Heading size="md">Prize Entries</Heading>

        <Text color="gray.500" mt={2} fontSize="sm">
          Review manually entered winning numbers and prize amounts. Confirm the
          information before verifying and publishing the draw.
        </Text>
      </Box>

      {error && (
        <Alert status="error" borderRadius="lg">
          <AlertIcon />
          {error}
        </Alert>
      )}

      {success && (
        <Alert status="success" borderRadius="lg">
          <AlertIcon />
          {success}
        </Alert>
      )}

      <Box className="panel-card">
        <Heading size="sm" mb={5}>
          Add a Prize Entry
        </Heading>

        {draws.length === 0 ? (
          <Alert status="info" borderRadius="lg">
            <AlertIcon />
            No draws exist yet. Create a draw in Draw Management first.
          </Alert>
        ) : (
          <form onSubmit={handleAddPrize}>
            <VStack align="stretch" spacing={4}>
              <FormControl isRequired>
                <FormLabel>Select Draw</FormLabel>

                <Select
                  placeholder="Choose a lottery draw"
                  value={selectedDrawId}
                  onChange={(event) => {
                    setSelectedDrawId(event.target.value);
                    setSuccess("");
                    setError("");
                  }}
                >
                  {draws.map((draw) => (
                    <option key={draw.id} value={draw.id}>
                      {draw.drawCode} — {draw.drawDateText} ({draw.status})
                    </option>
                  ))}
                </Select>
              </FormControl>

              {selectedDraw && (
                <Box>
                  <HStack>
                    <Text fontSize="sm" color="gray.600">
                      Selected draw:
                    </Text>

                    <Text fontSize="sm" fontWeight="bold">
                      {selectedDraw.drawCode}
                    </Text>
                  </HStack>

                  <HStack mt={2}>
                    <Text fontSize="sm" color="gray.600">
                      Draw status:
                    </Text>

                    <Badge
                      colorScheme={
                        selectedDraw.status === "DRAFT"
                          ? "yellow"
                          : selectedDraw.status === "VERIFIED"
                            ? "blue"
                            : "green"
                      }
                    >
                      {selectedDraw.status}
                    </Badge>
                  </HStack>

                  <Text fontSize="xs" color="gray.500" mt={2}>
                    Draw ID: {selectedDraw.id}
                  </Text>
                </Box>
              )}

              <FormControl isRequired>
                <FormLabel>Prize Name</FormLabel>

                <Input
                  placeholder="Enter the prize category"
                  value={prizeName}
                  onChange={(event) => setPrizeName(event.target.value)}
                />
              </FormControl>

              <FormControl isRequired>
                <FormLabel>Winning Number</FormLabel>

                <Input
                  placeholder="Enter the winning number"
                  value={winningNumber}
                  onChange={(event) => setWinningNumber(event.target.value)}
                />

                <Text fontSize="xs" color="gray.500" mt={1}>
                  Enter the winning number exactly as confirmed during manual
                  review.
                </Text>
              </FormControl>

              <FormControl>
                <FormLabel>Prize Amount (optional)</FormLabel>

                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Enter the confirmed prize amount"
                  value={prizeAmount}
                  onChange={(event) => setPrizeAmount(event.target.value)}
                />
              </FormControl>

              <FormControl isRequired>
                <FormLabel>Currency</FormLabel>

                <Select
                  value={currency}
                  onChange={(event) => setCurrency(event.target.value)}
                >
                  <option value="ETB">ETB — Ethiopian Birr</option>
                </Select>
              </FormControl>

              <Button
                type="submit"
                bg="#111827"
                color="white"
                _hover={{ bg: "gray.700" }}
                isLoading={saving}
                loadingText="Saving prize..."
                isDisabled={!selectedDraw || selectedDraw.status !== "DRAFT"}
              >
                Save Prize Entry
              </Button>

              {selectedDraw && selectedDraw.status !== "DRAFT" && (
                <Text color="orange.600" fontSize="sm">
                  This draw is not a draft. Prize entries cannot be added
                  through this form.
                </Text>
              )}
            </VStack>
          </form>
        )}
      </Box>

      <Box className="panel-card">
        <Heading size="sm" mb={4}>
          Saved Prize Entries
        </Heading>

        {!selectedDraw ? (
          <Text color="gray.500" fontSize="sm">
            Select a draw to view its prize entries.
          </Text>
        ) : selectedDraw.prizes.length === 0 ? (
          <Text color="gray.500" fontSize="sm">
            No prize entries have been saved for this draw.
          </Text>
        ) : (
          <TableContainer>
            <Table size="sm">
              <Thead>
                <Tr>
                  <Th>Prize</Th>
                  <Th>Winning Number</Th>
                  <Th isNumeric>Amount</Th>
                  <Th>Currency</Th>
                </Tr>
              </Thead>

              <Tbody>
                {selectedDraw.prizes.map((prize) => (
                  <Tr key={prize.id}>
                    <Td>{prize.prizeName}</Td>
                    <Td>{prize.winningNumber}</Td>
                    <Td isNumeric>{prize.prizeAmount ?? "Not entered"}</Td>
                    <Td>{prize.currency}</Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </TableContainer>
        )}
      </Box>
    </VStack>
  );
}
