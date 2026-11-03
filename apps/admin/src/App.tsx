import { useEffect, useState } from "react";
import PrizeEntriesPage from "./pages/PrizeEntriesPage";
import LoginPage from "./pages/LoginPage";
import { apiRequest } from "./lib/api";

import {
  Box,
  Flex,
  Grid,
  GridItem,
  Heading,
  Text,
  Button,
  Badge,
  Input,
  InputGroup,
  InputLeftElement,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  TableContainer,
  HStack,
  VStack,
  Divider,
  Avatar,
  Icon,
  useDisclosure,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  ModalCloseButton,
  FormControl,
  FormLabel,
  Textarea,
} from "@chakra-ui/react";

import {
  LayoutDashboard,
  Ticket,
  Trophy,
  Users,
  Settings,
  Search,
  Bell,
  Plus,
  ArrowUpRight,
  ShieldCheck,
  CalendarDays,
  ClipboardList,
  Menu,
  X,
} from "lucide-react";

type Draw = {
  id: string;
  code: string;
  date: string;
  status: "DRAFT" | "VERIFIED" | "PUBLISHED";
  prizes: number;
};

type ApiDraw = {
  id: string;
  drawCode: string;
  drawDateText: string;
  status: "DRAFT" | "VERIFIED" | "PUBLISHED";
  prizes: unknown[];
};

type DrawResponse = ApiDraw[] | { draws: ApiDraw[] };

const navigation = [
  { label: "Overview", icon: LayoutDashboard },
  { label: "Draw Management", icon: CalendarDays },
  { label: "Prize Entries", icon: Trophy },
  { label: "Tickets", icon: Ticket },
  { label: "Users", icon: Users },
  { label: "Verification", icon: ShieldCheck },
  { label: "Activity Logs", icon: ClipboardList },
  { label: "Settings", icon: Settings },
];

function StatCard({
  title,
  value,
  description,
  icon,
}: {
  title: string;
  value: string;
  description: string;
  icon: typeof Users;
}) {
  return (
    <Box className="stat-card">
      <Flex justify="space-between" align="start">
        <Box>
          <Text color="gray.500" fontSize="sm">
            {title}
          </Text>
          <Heading size="lg" mt={2} color="gray.800">
            {value}
          </Heading>
        </Box>

        <Box className="stat-icon">
          <Icon as={icon} boxSize={5} />
        </Box>
      </Flex>

      <Text mt={4} color="gray.500" fontSize="xs">
        {description}
      </Text>
    </Box>
  );
}

function StatusBadge({ status }: { status: Draw["status"] }) {
  const styles = {
    DRAFT: { colorScheme: "gray", label: "Draft" },
    VERIFIED: { colorScheme: "blue", label: "Verified" },
    PUBLISHED: { colorScheme: "green", label: "Published" },
  };

  const style = styles[status];

  return (
    <Badge
      colorScheme={style.colorScheme}
      borderRadius="full"
      px={3}
      py={1}
      textTransform="none"
    >
      {style.label}
    </Badge>
  );
}

export default function App() {
  const [authChecking, setAuthChecking] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  const [activePage, setActivePage] = useState("Overview");

  // Stores the exact draw selected from Draw Management.
  const [selectedDrawId, setSelectedDrawId] = useState("");

  const [search, setSearch] = useState("");
  const [draws, setDraws] = useState<Draw[]>([]);
  const [drawsLoading, setDrawsLoading] = useState(false);
  const [drawsError, setDrawsError] = useState("");

  const [creatingDraw, setCreatingDraw] = useState(false);
  const [drawCode, setDrawCode] = useState("");
  const [drawDate, setDrawDate] = useState("");
  const [notes, setNotes] = useState("");

  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const { isOpen, onOpen, onClose } = useDisclosure();

  // Check admin authentication.
  useEffect(() => {
    let active = true;

    apiRequest<{ authenticated: boolean }>("/api/admin/auth/me")
      .then((data) => {
        if (active) {
          setIsAuthenticated(data.authenticated);
        }
      })
      .catch(() => {
        if (active) {
          setIsAuthenticated(false);
        }
      })
      .finally(() => {
        if (active) {
          setAuthChecking(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  // Load draws from the database.
  useEffect(() => {
    if (!isAuthenticated) return;

    let active = true;

    async function loadDraws() {
      setDrawsLoading(true);
      setDrawsError("");

      try {
        const response = await apiRequest<DrawResponse>("/api/admin/draws");

        const records = Array.isArray(response) ? response : response.draws;

        const mappedDraws: Draw[] = records.map((draw) => ({
          id: draw.id,
          code: draw.drawCode,
          date: draw.drawDateText,
          status: draw.status,
          prizes: Array.isArray(draw.prizes) ? draw.prizes.length : 0,
        }));

        if (active) {
          setDraws(mappedDraws);
        }
      } catch (error) {
        if (active) {
          setDrawsError(
            error instanceof Error
              ? error.message
              : "Could not load lottery draws.",
          );
        }
      } finally {
        if (active) {
          setDrawsLoading(false);
        }
      }
    }

    void loadDraws();

    return () => {
      active = false;
    };
  }, [isAuthenticated]);

  const filteredDraws = draws.filter((draw) =>
    draw.code.toLowerCase().includes(search.toLowerCase()),
  );

  // Open the Prize Entries page for the exact selected draw.
  function openDrawReview(draw: Draw) {
    setSelectedDrawId(draw.id);
    setActivePage("Prize Entries");
    setMobileNavOpen(false);
  }

  async function createDraw() {
    if (!drawCode.trim() || !drawDate.trim()) return;

    setCreatingDraw(true);
    setDrawsError("");

    try {
      await apiRequest("/api/admin/draws", {
        method: "POST",
        body: {
          drawCode: drawCode.trim(),
          drawDateText: drawDate.trim(),
          notes: notes.trim() || undefined,
        },
      });

      setDrawCode("");
      setDrawDate("");
      setNotes("");

      onClose();
      setActivePage("Draw Management");

      const response = await apiRequest<DrawResponse>("/api/admin/draws");

      const records = Array.isArray(response) ? response : response.draws;

      setDraws(
        records.map((draw) => ({
          id: draw.id,
          code: draw.drawCode,
          date: draw.drawDateText,
          status: draw.status,
          prizes: Array.isArray(draw.prizes) ? draw.prizes.length : 0,
        })),
      );
    } catch (error) {
      setDrawsError(
        error instanceof Error ? error.message : "Could not create the draw.",
      );
    } finally {
      setCreatingDraw(false);
    }
  }

  if (authChecking) {
    return (
      <Box minH="100vh" display="grid" placeItems="center" bg="gray.50">
        <Text color="gray.600">Checking your admin session...</Text>
      </Box>
    );
  }

  if (!isAuthenticated) {
    return <LoginPage onLogin={() => setIsAuthenticated(true)} />;
  }

  const pageDescriptions: Record<string, string> = {
    Overview: "Here's what's happening across your lottery platform.",
    "Draw Management": "Create draws and manage their publication lifecycle.",
    "Prize Entries": "Review winning numbers and prize amounts.",
    Tickets: "Explore tickets submitted by Telegram users.",
    Users: "Manage registered users and account status.",
    Verification: "Review results before they are published.",
    "Activity Logs": "Review administrative actions and system activity.",
    Settings: "Manage platform configuration.",
  };

  return (
    <Flex minH="100vh" bg="#F5F7FB" color="gray.800">
      {mobileNavOpen && (
        <Box
          position="fixed"
          inset={0}
          bg="blackAlpha.500"
          zIndex={19}
          display={{ base: "block", lg: "none" }}
          onClick={() => setMobileNavOpen(false)}
        />
      )}

      {/* Sidebar */}
      <Box
        className={`sidebar ${mobileNavOpen ? "sidebar-open" : ""}`}
        display="flex"
        flexDirection="column"
        w="250px"
        flexShrink={0}
        bg="#111827"
        color="white"
        minH="100vh"
        position={{ base: "fixed", lg: "sticky" }}
        top={0}
        left={0}
        zIndex={20}
        height="100vh"
        overflowY="auto"
      >
        <Flex align="center" gap={3} px={6} py={7}>
          <Flex
            bg="#D8F36A"
            color="#111827"
            w="42px"
            h="42px"
            borderRadius="xl"
            align="center"
            justify="center"
          >
            <Icon as={Ticket} boxSize={6} />
          </Flex>

          <Box>
            <Heading fontSize="md" letterSpacing="-0.4px">
              ADMAS
            </Heading>
            <Text color="gray.400" fontSize="xs">
              Lottery Control Center
            </Text>
          </Box>

          <Box ml="auto" display={{ base: "block", lg: "none" }}>
            <Button
              size="sm"
              variant="ghost"
              color="white"
              onClick={() => setMobileNavOpen(false)}
              aria-label="Close navigation"
            >
              <Icon as={X} />
            </Button>
          </Box>
        </Flex>

        <Text px={6} mb={3} fontSize="xs" color="gray.500" fontWeight="bold">
          WORKSPACE
        </Text>

        <VStack align="stretch" spacing={1} px={3}>
          {navigation.map((item) => {
            const active = activePage === item.label;

            return (
              <Button
                key={item.label}
                justifyContent="flex-start"
                variant="ghost"
                color={active ? "#D8F36A" : "gray.300"}
                bg={active ? "whiteAlpha.100" : "transparent"}
                _hover={{
                  bg: "whiteAlpha.100",
                  color: "white",
                }}
                leftIcon={<Icon as={item.icon} boxSize={4} />}
                fontWeight={active ? "semibold" : "normal"}
                fontSize="sm"
                onClick={() => {
                  setActivePage(item.label);
                  setMobileNavOpen(false);

                  // Direct Prize Entries navigation clears the previous
                  // review selection so the page can choose a draft.
                  if (item.label === "Prize Entries") {
                    setSelectedDrawId("");
                  }
                }}
              >
                {item.label}
              </Button>
            );
          })}
        </VStack>

        <Box px={4} mt={10}>
          <Box
            bg="whiteAlpha.100"
            border="1px solid"
            borderColor="whiteAlpha.200"
            borderRadius="xl"
            p={4}
          >
            <Icon as={ShieldCheck} color="#D8F36A" boxSize={5} />

            <Text fontWeight="semibold" mt={3} fontSize="sm">
              Admin workspace
            </Text>

            <Text color="gray.400" fontSize="xs" mt={1} lineHeight="tall">
              Verify official results before publishing them to users.
            </Text>
          </Box>
        </Box>

        <Flex px={5} py={5} mt="auto" align="center" gap={3}>
          <Avatar size="sm" name="Admin User" bg="#D8F36A" color="gray.900" />

          <Box overflow="hidden">
            <Text fontSize="sm" fontWeight="semibold">
              Admin User
            </Text>
            <Text color="gray.400" fontSize="xs">
              Admin workspace
            </Text>
          </Box>
        </Flex>
      </Box>

      {/* Main content */}
      <Box flex="1" minW={0}>
        <Flex
          bg="white"
          borderBottom="1px solid"
          borderColor="gray.200"
          px={{ base: 4, md: 8 }}
          py={4}
          align="center"
          gap={4}
          position="sticky"
          top={0}
          zIndex={10}
        >
          <Button
            display={{ base: "inline-flex", lg: "none" }}
            variant="ghost"
            onClick={() => setMobileNavOpen(true)}
            aria-label="Open navigation"
          >
            <Icon as={Menu} />
          </Button>

          <Box flex="1">
            <Heading fontSize={{ base: "md", md: "lg" }}>{activePage}</Heading>

            <Text
              color="gray.500"
              fontSize="xs"
              mt={1}
              display={{ base: "none", md: "block" }}
            >
              Admas Lottery Checker / {activePage}
            </Text>
          </Box>

          <InputGroup maxW="240px" display={{ base: "none", md: "flex" }}>
            <InputLeftElement pointerEvents="none">
              <Icon as={Search} color="gray.400" boxSize={4} />
            </InputLeftElement>

            <Input
              placeholder="Search draw code..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              bg="gray.50"
              borderColor="gray.200"
              size="sm"
            />
          </InputGroup>

          <Button
            variant="ghost"
            aria-label="Notifications"
            position="relative"
          >
            <Icon as={Bell} boxSize={5} />
          </Button>
        </Flex>

        <Box p={{ base: 4, md: 8 }} maxW="1500px" mx="auto">
          <Flex
            justify="space-between"
            align={{ base: "start", md: "center" }}
            direction={{ base: "column", md: "row" }}
            gap={4}
            mb={8}
          >
            <Box>
              <Heading size="lg" letterSpacing="-0.7px">
                {activePage === "Overview"
                  ? "Good to see you, Admin"
                  : activePage}
              </Heading>

              <Text color="gray.500" mt={2} fontSize="sm">
                {pageDescriptions[activePage]}
              </Text>
            </Box>

            <HStack>
              <Badge colorScheme="green" px={3} py={2} borderRadius="md">
                LIVE DATABASE
              </Badge>

              <Button
                bg="#111827"
                color="white"
                _hover={{ bg: "gray.700" }}
                leftIcon={<Icon as={Plus} />}
                onClick={onOpen}
              >
                New draw
              </Button>
            </HStack>
          </Flex>

          {/* Overview */}
          {activePage === "Overview" && (
            <>
              <Grid
                templateColumns={{
                  base: "1fr",
                  sm: "repeat(2, 1fr)",
                  xl: "repeat(4, 1fr)",
                }}
                gap={5}
              >
                <GridItem>
                  <StatCard
                    title="Registered users"
                    value="—"
                    description="Connect the API to load real users"
                    icon={Users}
                  />
                </GridItem>

                <GridItem>
                  <StatCard
                    title="Saved tickets"
                    value="—"
                    description="Connect the API to load real tickets"
                    icon={Ticket}
                  />
                </GridItem>

                <GridItem>
                  <StatCard
                    title="Total draws"
                    value={String(draws.length)}
                    description="Draws loaded from the database"
                    icon={CalendarDays}
                  />
                </GridItem>

                <GridItem>
                  <StatCard
                    title="Published draws"
                    value={String(
                      draws.filter((draw) => draw.status === "PUBLISHED")
                        .length,
                    )}
                    description="Published lottery draws"
                    icon={Trophy}
                  />
                </GridItem>
              </Grid>

              <Grid
                templateColumns={{
                  base: "1fr",
                  xl: "minmax(0, 1.6fr) minmax(280px, 0.8fr)",
                }}
                gap={5}
                mt={7}
              >
                <GridItem>
                  <Box className="panel-card" h="100%">
                    <Flex align="center" justify="space-between" mb={5}>
                      <Box>
                        <Heading size="md">Recent draws</Heading>
                        <Text color="gray.500" fontSize="sm" mt={1}>
                          Latest lottery draws
                        </Text>
                      </Box>

                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setActivePage("Draw Management")}
                        rightIcon={<Icon as={ArrowUpRight} />}
                      >
                        View all
                      </Button>
                    </Flex>

                    <DrawTable
                      draws={draws.slice(0, 4)}
                      onSelect={(draw) => {
                        setSelectedDrawId(draw.id);
                        setActivePage("Prize Entries");
                      }}
                    />
                  </Box>
                </GridItem>

                <GridItem>
                  <Box className="panel-card" h="100%">
                    <Heading size="md">Publishing workflow</Heading>

                    <Text color="gray.500" fontSize="sm" mt={1} mb={6}>
                      Keep every result accountable.
                    </Text>

                    <VStack align="stretch" spacing={5}>
                      {[
                        {
                          number: "01",
                          title: "Create a draft",
                          desc: "Enter the draw reference and date.",
                        },
                        {
                          number: "02",
                          title: "Enter prize entries",
                          desc: "Record winning numbers and prize amounts.",
                        },
                        {
                          number: "03",
                          title: "Verify and publish",
                          desc: "Manually confirm results before publication.",
                        },
                      ].map((step) => (
                        <HStack align="start" key={step.number} spacing={3}>
                          <Flex
                            w="38px"
                            h="38px"
                            flexShrink={0}
                            borderRadius="lg"
                            align="center"
                            justify="center"
                            bg="#F0F4E5"
                            color="#4A5D16"
                            fontWeight="bold"
                            fontSize="sm"
                          >
                            {step.number}
                          </Flex>

                          <Box>
                            <Text fontWeight="semibold" fontSize="sm">
                              {step.title}
                            </Text>

                            <Text
                              fontSize="xs"
                              color="gray.500"
                              mt={1}
                              lineHeight="tall"
                            >
                              {step.desc}
                            </Text>
                          </Box>
                        </HStack>
                      ))}
                    </VStack>

                    <Divider my={6} />

                    <Flex align="center" gap={2} color="gray.500">
                      <Icon as={ShieldCheck} boxSize={4} />
                      <Text fontSize="xs">
                        Publication controls are server-authorized.
                      </Text>
                    </Flex>
                  </Box>
                </GridItem>
              </Grid>
            </>
          )}

          {/* Draw Management */}
          {activePage === "Draw Management" && (
            <Box className="panel-card">
              <Flex
                align={{ base: "start", md: "center" }}
                justify="space-between"
                gap={3}
                mb={5}
                direction={{ base: "column", md: "row" }}
              >
                <Box>
                  <Heading size="md">All draws</Heading>
                  <Text color="gray.500" fontSize="sm" mt={1}>
                    {draws.length} draws
                  </Text>
                </Box>

                <InputGroup maxW={{ base: "100%", md: "280px" }}>
                  <InputLeftElement pointerEvents="none">
                    <Icon as={Search} color="gray.400" boxSize={4} />
                  </InputLeftElement>

                  <Input
                    placeholder="Search by draw code..."
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    size="sm"
                  />
                </InputGroup>
              </Flex>

              {drawsLoading && (
                <Text color="gray.500" mb={4}>
                  Loading draws from the database...
                </Text>
              )}

              {drawsError && (
                <Text color="red.500" mb={4}>
                  {drawsError}
                </Text>
              )}

              <DrawTable draws={filteredDraws} onSelect={openDrawReview} />
            </Box>
          )}

          {/* Prize Entries */}
          {activePage === "Prize Entries" && (
            <PrizeEntriesPage
              key={selectedDrawId || "default-prize-entries"}
              initialSelectedDrawId={selectedDrawId}
            />
          )}

          {/* Other pages */}
          {activePage !== "Overview" &&
            activePage !== "Draw Management" &&
            activePage !== "Prize Entries" && (
              <Box className="panel-card">
                <Flex
                  align="start"
                  gap={4}
                  direction={{ base: "column", sm: "row" }}
                >
                  <Flex
                    w="52px"
                    h="52px"
                    bg="#F0F4E5"
                    color="#4A5D16"
                    borderRadius="xl"
                    align="center"
                    justify="center"
                  >
                    <Icon
                      as={
                        activePage === "Tickets"
                          ? Ticket
                          : activePage === "Users"
                            ? Users
                            : activePage === "Verification"
                              ? ShieldCheck
                              : activePage === "Activity Logs"
                                ? ClipboardList
                                : Settings
                      }
                      boxSize={6}
                    />
                  </Flex>

                  <Box>
                    <Heading size="md">{activePage}</Heading>

                    <Text
                      color="gray.500"
                      mt={2}
                      maxW="650px"
                      lineHeight="tall"
                    >
                      This section is part of the dashboard navigation. Its live
                      data and actions will be implemented as we connect the API
                      and add server-side authorization.
                    </Text>

                    {activePage === "Verification" && (
                      <Button
                        mt={5}
                        bg="#111827"
                        color="white"
                        _hover={{ bg: "gray.700" }}
                        onClick={() => setActivePage("Draw Management")}
                      >
                        Review draws
                      </Button>
                    )}
                  </Box>
                </Flex>
              </Box>
            )}

          <Text textAlign="center" color="gray.400" fontSize="xs" mt={10}>
            Admas Lottery Checker · Admin dashboard
          </Text>
        </Box>
      </Box>

      {/* Create Draw Modal */}
      <Modal isOpen={isOpen} onClose={onClose} isCentered>
        <ModalOverlay />

        <ModalContent mx={3} borderRadius="xl">
          <ModalHeader>Create a lottery draw</ModalHeader>
          <ModalCloseButton />

          <ModalBody>
            <Text fontSize="sm" color="gray.500" mb={5}>
              Create a draft draw record. Manually verify the information before
              publishing results.
            </Text>

            <VStack spacing={4}>
              <FormControl isRequired>
                <FormLabel>Draw code</FormLabel>

                <Input
                  placeholder="e.g. DEMO-DRAW-004"
                  value={drawCode}
                  onChange={(event) => setDrawCode(event.target.value)}
                />
              </FormControl>

              <FormControl isRequired>
                <FormLabel>Draw date or official date text</FormLabel>

                <Input
                  placeholder="Enter the draw date"
                  value={drawDate}
                  onChange={(event) => setDrawDate(event.target.value)}
                />
              </FormControl>

              <FormControl>
                <FormLabel>Notes (optional)</FormLabel>

                <Textarea
                  placeholder="Internal notes"
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                />
              </FormControl>
            </VStack>
          </ModalBody>

          <ModalFooter gap={3}>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>

            <Button
              bg="#111827"
              color="white"
              _hover={{ bg: "gray.700" }}
              onClick={createDraw}
              isLoading={creatingDraw}
              loadingText="Saving draw..."
              isDisabled={!drawCode.trim() || !drawDate.trim()}
            >
              Create draw
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Flex>
  );
}

function DrawTable({
  draws,
  onSelect,
}: {
  draws: Draw[];
  onSelect: (draw: Draw) => void;
}) {
  if (draws.length === 0) {
    return (
      <Box py={12} textAlign="center">
        <Text color="gray.500">No draws match your search.</Text>
      </Box>
    );
  }

  return (
    <TableContainer>
      <Table size="sm" variant="simple">
        <Thead>
          <Tr>
            <Th>Draw code</Th>
            <Th>Date</Th>
            <Th>Status</Th>
            <Th isNumeric>Prize entries</Th>
            <Th>Action</Th>
          </Tr>
        </Thead>

        <Tbody>
          {draws.map((draw) => (
            <Tr key={draw.id}>
              <Td fontWeight="semibold">{draw.code}</Td>
              <Td color="gray.500">{draw.date}</Td>

              <Td>
                <StatusBadge status={draw.status} />
              </Td>

              <Td isNumeric>{draw.prizes}</Td>

              <Td>
                <Button
                  size="xs"
                  variant="outline"
                  onClick={() => onSelect(draw)}
                >
                  Review
                </Button>
              </Td>
            </Tr>
          ))}
        </Tbody>
      </Table>
    </TableContainer>
  );
}
