-- Bookstore Database Schema & Seed Data (100 Books & Default Users)

CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(64) UNIQUE NOT NULL,
    password_hash VARCHAR(128) NOT NULL,
    password_salt VARCHAR(64) NOT NULL,
    email VARCHAR(128) UNIQUE,
    full_name VARCHAR(128),
    role VARCHAR(32) DEFAULT 'reader',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP WITH TIME ZONE
);

CREATE TABLE IF NOT EXISTS books (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    author VARCHAR(255) NOT NULL,
    isbn VARCHAR(32) UNIQUE NOT NULL,
    genre VARCHAR(64) NOT NULL,
    price NUMERIC(8, 2) NOT NULL DEFAULT 19.99,
    stock_quantity INTEGER NOT NULL DEFAULT 50,
    rating NUMERIC(3, 2) NOT NULL DEFAULT 4.50,
    publication_year INTEGER NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_books_genre ON books(genre);
CREATE INDEX IF NOT EXISTS idx_books_rating ON books(rating DESC);
CREATE INDEX IF NOT EXISTS idx_books_title_author ON books(title, author);

CREATE TABLE IF NOT EXISTS audit_logs (
    id SERIAL PRIMARY KEY,
    action VARCHAR(50) NOT NULL,
    details JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Seed Default Demo Users (Passwords: admin123, reader123, alice123)
INSERT INTO users (username, password_hash, password_salt, email, full_name, role) VALUES
('admin', 'ac0c84896f6ccc9ada728b16698a2de1b567518f2653f377a66f55e955e9c373', '964493cf08e4375bf9e4a6e3bef721bd', 'admin@klystr.io', 'System Administrator', 'admin'),
('demo_reader', '33de0ea6f43ab56dffddc8e0a8c06c05aedad2aacffdb91a5496c79456aad21d', '227212595e9eeb30bb3d9a93d8b7ff45', 'reader@klystr.io', 'Demo Reader', 'reader'),
('alice_books', 'df9c4450756dc572a58a94c082a8c8bae23873ff07635a71b502368d3fa233b7', '8770390f87adf92d35655f3c1337605a', 'alice@example.com', 'Alice In Wonderland', 'reader')
ON CONFLICT (username) DO NOTHING;

-- Seed 100 Realistic Books
INSERT INTO books (title, author, isbn, genre, price, stock_quantity, rating, publication_year, description) VALUES
-- Computer Science & Engineering (1-20)
('Designing Data-Intensive Applications', 'Martin Kleppmann', '978-1449373320', 'Computer Science', 45.99, 25, 4.95, 2017, 'The definitive guide to distributed systems, storage engines, and stream processing.'),
('Clean Code', 'Robert C. Martin', '978-0132350884', 'Computer Science', 38.50, 40, 4.70, 2008, 'A handbook of agile software craftsmanship and maintainable engineering.'),
('The Pragmatic Programmer', 'David Thomas & Andrew Hunt', '978-0135957059', 'Computer Science', 42.00, 30, 4.85, 2019, 'Your journey to mastery in modern pragmatic software development.'),
('Structure and Interpretation of Computer Programs', 'Harold Abelson & Gerald Jay Sussman', '978-0262510875', 'Computer Science', 55.00, 15, 4.80, 1996, 'Classic foundational computer science text exploring abstractions and lisp interpreters.'),
('Introduction to Algorithms', 'Thomas H. Cormen et al.', '978-0262046305', 'Computer Science', 85.00, 20, 4.75, 2022, 'Comprehensive reference on algorithm design, asymptotic analysis, and graph theory.'),
('Site Reliability Engineering', 'Betsy Beyer et al.', '978-1491929124', 'Computer Science', 39.99, 35, 4.80, 2016, 'How Google runs production distributed systems at planetary scale.'),
('Kubernetes in Action', 'Marko Luksa', '978-1617293726', 'Computer Science', 49.99, 18, 4.78, 2017, 'Deep dive into container orchestration, pods, networking, and controllers.'),
('Computer Systems: A Programmer''s Perspective', 'Randal E. Bryant & David R. O''Hallaron', '978-0134092669', 'Computer Science', 72.00, 12, 4.88, 2015, 'Mastering how computer architecture, assembly, memory hierarchy, and caching interact.'),
('Operating Systems: Three Easy Pieces', 'Remzi H. Arpaci-Dusseau', '978-1985086593', 'Computer Science', 32.50, 22, 4.90, 2018, 'Virtualization, concurrency, and persistence explained with clarity.'),
('Database Internals', 'Alex Petrov', '978-1492040347', 'Computer Science', 44.50, 28, 4.82, 2019, 'A deep dive into distributed data storage architectures, B-trees, and LSM trees.'),
('Modern Operating Systems', 'Andrew S. Tanenbaum', '978-0133591620', 'Computer Science', 78.00, 10, 4.65, 2014, 'Processes, memory management, file systems, and operating system security.'),
('Computer Networks', 'Andrew S. Tanenbaum', '978-0132126953', 'Computer Science', 80.00, 14, 4.70, 2010, 'Protocols, layers, routing, TCP congestion control, and physical signaling.'),
('Understanding Distributed Systems', 'Roberto Vitillo', '978-1838430207', 'Computer Science', 34.99, 30, 4.85, 2021, 'Communication, coordination, scalability, and resiliency in modern microservices.'),
('Learning eBPF', 'Liz Rice', '978-1098135126', 'Computer Science', 41.99, 26, 4.92, 2023, 'Linux kernel observability, network packet filtering, and runtime security.'),
('Building Microservices', 'Sam Newman', '978-1492034025', 'Computer Science', 46.50, 32, 4.75, 2021, 'Designing fine-grained systems, service boundaries, and event-driven architectures.'),
('Production-Ready Microservices', 'Susan J. Fowler', '978-1491965979', 'Computer Science', 36.00, 24, 4.60, 2016, 'Standardizing resilience, monitoring, documentation, and operational readiness.'),
('TCP/IP Illustrated, Vol. 1', 'W. Richard Stevens', '978-0321336316', 'Computer Science', 68.00, 16, 4.90, 2011, 'The foundational reference for TCP three-way handshake, windowing, and routing.'),
('Linux Kernel Development', 'Robert Love', '978-0672329463', 'Computer Science', 48.00, 19, 4.79, 2010, 'Kernel design, process management, scheduling, and system calls.'),
('Refactoring', 'Martin Fowler', '978-0134757599', 'Computer Science', 47.99, 35, 4.83, 2018, 'Improving the design of existing code through proven transformations.'),
('Domain-Driven Design', 'Eric Evans', '978-0321125217', 'Computer Science', 52.00, 21, 4.71, 2003, 'Tackling complexity in the heart of enterprise software with ubiquitous language.'),

-- Science Fiction (21-40)
('Dune', 'Frank Herbert', '978-0441172719', 'Science Fiction', 18.99, 50, 4.88, 1965, 'Epic planetary ecology, spice trade politics, and messianic uprising on Arrakis.'),
('Neuromancer', 'William Gibson', '978-0441569595', 'Science Fiction', 15.50, 45, 4.72, 1984, 'The groundbreaking cyberpunk masterpiece that birthed the concept of cyberspace.'),
('Foundation', 'Isaac Asimov', '978-0553293357', 'Science Fiction', 16.99, 42, 4.80, 1951, 'Hari Seldon uses psychohistory to preserve galactic civilization from collapse.'),
('Snow Crash', 'Neal Stephenson', '978-0553380958', 'Science Fiction', 17.50, 38, 4.75, 1992, 'Hyper-commercialized future, hacker katana delivery, and the Metaverse.'),
('The Three-Body Problem', 'Cixin Liu', '978-0765382030', 'Science Fiction', 19.99, 48, 4.85, 2008, 'Humanity encounters the Trisolaran civilization facing cosmic orbital instability.'),
('Do Androids Dream of Electric Sheep?', 'Philip K. Dick', '978-0345404473', 'Science Fiction', 14.99, 36, 4.68, 1968, 'Bounty hunter Rick Deckard tracks rogue Nexus-6 replicants in post-apocalyptic San Francisco.'),
('Hyperion', 'Dan Simmons', '978-0553283686', 'Science Fiction', 18.00, 32, 4.86, 1989, 'Seven pilgrims journey to the Time Tombs of Hyperion guarded by the Shrike.'),
('Ender''s Game', 'Orson Scott Card', '978-0812550702', 'Science Fiction', 13.99, 60, 4.81, 1985, 'Young Ender Wiggin is trained in orbital simulations against an alien threat.'),
('The Left Hand of Darkness', 'Ursula K. Le Guin', '978-0441478125', 'Science Fiction', 16.50, 28, 4.77, 1969, 'An ambassador journeys to the icy world of Gethen exploring gender and diplomacy.'),
('Fahrenheit 451', 'Ray Bradbury', '978-1451673319', 'Science Fiction', 14.50, 55, 4.73, 1953, 'Fireman Guy Montag burns banned books in a dystopian totalitarian society.'),
('Brave New World', 'Aldous Huxley', '978-0060850524', 'Science Fiction', 15.99, 52, 4.70, 1932, 'Genetically conditioned caste system and synthetic happiness in a technological world.'),
('Solaris', 'Stanislaw Lem', '978-0156027601', 'Science Fiction', 14.00, 25, 4.65, 1961, 'Psychologist Kris Kelvin explores the mysterious sentient oceanic planet Solaris.'),
('Rendezvous with Rama', 'Arthur C. Clarke', '978-0358380221', 'Science Fiction', 16.00, 34, 4.74, 1973, 'Human explorers investigate a massive enigmatic cylindrical alien vessel.'),
('The Dispossessed', 'Ursula K. Le Guin', '978-0060512750', 'Science Fiction', 17.00, 30, 4.80, 1974, 'Physicist Shevek seeks reconciliation between an anarchist moon and capitalist planet.'),
('Children of Time', 'Adrian Tchaikovsky', '978-0316452502', 'Science Fiction', 18.50, 40, 4.89, 2015, 'Terraforming experiment creates an accelerated arachnid civilization encountering human refugees.'),
('I, Robot', 'Isaac Asimov', '978-0553382563', 'Science Fiction', 15.00, 44, 4.71, 1950, 'The Three Laws of Robotics tested through ethical and operational dilemmas.'),
('Contact', 'Carl Sagan', '978-0671004101', 'Science Fiction', 16.50, 35, 4.78, 1985, 'Radio astronomer Ellie Arroway decodes humanity''s first extraterrestrial signal.'),
('Ringworld', 'Larry Niven', '978-0345339027', 'Science Fiction', 15.50, 29, 4.62, 1970, 'Expedition to an artificial ring structure orbiting a distant star.'),
('2001: A Space Odyssey', 'Arthur C. Clarke', '978-0451457998', 'Science Fiction', 14.99, 46, 4.76, 1968, 'The voyage of the Discovery One and the emergent sentience of HAL 9000.'),
('The Stars My Destination', 'Alfred Bester', '978-1876963460', 'Science Fiction', 15.00, 22, 4.73, 1956, 'Teleportation, vengeance, and corporate intrigue across the Solar System.'),

-- Classic Literature (41-60)
('1984', 'George Orwell', '978-0451524935', 'Classic Literature', 12.99, 70, 4.85, 1949, 'Winston Smith struggles against surveillance and doublethink in Oceania.'),
('The Great Gatsby', 'F. Scott Fitzgerald', '978-0743273565', 'Classic Literature', 11.50, 65, 4.60, 1925, 'The tragedy of wealth, obsession, and the American Dream in 1920s Long Island.'),
('To Kill a Mockingbird', 'Harper Lee', '978-0060935467', 'Classic Literature', 13.50, 60, 4.89, 1960, 'Atticus Finch defends racial justice seen through the eyes of young Scout.'),
('Crime and Punishment', 'Fyodor Dostoevsky', '978-0140449136', 'Classic Literature', 16.99, 38, 4.82, 1866, 'Raskolnikov commits murder in St. Petersburg and endures intense psychological torment.'),
('Pride and Prejudice', 'Jane Austen', '978-0141439518', 'Classic Literature', 10.99, 58, 4.78, 1813, 'Elizabeth Bennet navigates societal expectations, family pride, and Mr. Darcy.'),
('The Brothers Karamazov', 'Fyodor Dostoevsky', '978-0374528379', 'Classic Literature', 19.50, 30, 4.90, 1880, 'Philosophical questions of faith, free will, morality, and patricide.'),
('Moby-Dick', 'Herman Melville', '978-0142437247', 'Classic Literature', 14.00, 35, 4.55, 1851, 'Captain Ahab obsessively pursues the great white whale aboard the Pequod.'),
('The Odyssey', 'Homer', '978-0140268866', 'Classic Literature', 13.99, 45, 4.70, -800, 'Odysseus endures monsters and divine wrath on his ten-year voyage home to Ithaca.'),
('War and Peace', 'Leo Tolstoy', '978-0199232765', 'Classic Literature', 22.00, 25, 4.80, 1869, 'Epic panorama of Russian society during the Napoleonic Wars.'),
('Ulysses', 'James Joyce', '978-0679722762', 'Classic Literature', 18.50, 20, 4.50, 1922, 'Leopold Bloom wanders Dublin on June 16, 1904, in groundbreaking stream of consciousness.'),
('The Catcher in the Rye', 'J.D. Salinger', '978-0316769488', 'Classic Literature', 12.50, 50, 4.52, 1951, 'Holden Caulfield wanders New York City railing against superficiality.'),
('Wuthering Heights', 'Emily Bronte', '978-0141439556', 'Classic Literature', 11.99, 40, 4.62, 1847, 'The tempestuous, destructive passion between Heathcliff and Catherine on the Yorkshire moors.'),
('Jane Eyre', 'Charlotte Bronte', '978-0141441146', 'Classic Literature', 12.00, 42, 4.74, 1847, 'An orphaned governess fights for independence and love at Thornfield Hall.'),
('Frankenstein', 'Mary Shelley', '978-0141439471', 'Classic Literature', 10.50, 55, 4.67, 1818, 'Victor Frankenstein creates sapient life and unleashes tragic unforeseen consequences.'),
('The Metamorphosis', 'Franz Kafka', '978-0143105244', 'Classic Literature', 9.99, 60, 4.69, 1915, 'Gregor Samsa wakes up transformed into a monstrous vermin.'),
('The Stranger', 'Albert Camus', '978-0679720201', 'Classic Literature', 11.00, 48, 4.68, 1942, 'Meursault faces trial in Algiers after an emotionally detached murder.'),
('The Count of Monte Cristo', 'Alexandre Dumas', '978-0140449266', 'Classic Literature', 18.00, 45, 4.91, 1844, 'Edmond Dantes escapes the Chateau d''If and plots calculated revenge.'),
('Les Miserables', 'Victor Hugo', '978-0451419439', 'Classic Literature', 19.99, 32, 4.84, 1862, 'Jean Valjean seeks redemption pursued relentlessly by Inspector Javert.'),
('Don Quixote', 'Miguel de Cervantes', '978-0060934347', 'Classic Literature', 17.50, 28, 4.76, 1605, 'An eccentric nobleman rides across Spain seeking chivalric knighthood.'),
('The Picture of Dorian Gray', 'Oscar Wilde', '978-0141439570', 'Classic Literature', 11.50, 52, 4.73, 1890, 'A portrait ages with vice while Dorian Gray preserves youthful innocence.'),

-- Mystery & Thriller (61-80)
('The Da Vinci Code', 'Dan Brown', '978-0307474278', 'Mystery & Thriller', 14.99, 50, 4.61, 2003, 'Robert Langdon unravels symbological riddles and secret societies in Paris.'),
('Gone Girl', 'Gillian Flynn', '978-0307588371', 'Mystery & Thriller', 15.50, 48, 4.71, 2012, 'Nick Dunne becomes the prime suspect when his wife Amy vanishes on their anniversary.'),
('The Girl with the Dragon Tattoo', 'Stieg Larsson', '978-0307949486', 'Mystery & Thriller', 16.00, 45, 4.77, 2005, 'Journalist Mikael Blomkvist and hacker Lisbeth Salander investigate a decades-old disappearance.'),
('A Study in Scarlet', 'Arthur Conan Doyle', '978-0140439083', 'Mystery & Thriller', 10.99, 55, 4.75, 1887, 'The first appearance of Sherlock Holmes and Dr. John Watson investigating a London murder.'),
('The Silent Patient', 'Alex Michaelides', '978-1250301697', 'Mystery & Thriller', 16.99, 60, 4.68, 2019, 'Alicia Berenson shoots her husband five times and never speaks another word.'),
('And Then There Were None', 'Agatha Christie', '978-0062073488', 'Mystery & Thriller', 13.99, 65, 4.88, 1939, 'Ten strangers are lured to an isolated island mansion and murdered one by one.'),
('The Big Sleep', 'Raymond Chandler', '978-0394758282', 'Mystery & Thriller', 13.50, 35, 4.72, 1939, 'Private detective Philip Marlowe investigates blackmail and extortion in Los Angeles.'),
('In the Woods', 'Tana French', '978-0143113492', 'Mystery & Thriller', 15.00, 30, 4.60, 2007, 'Detective Rob Ryan investigates a child murder mirroring his own childhood trauma.'),
('Sharp Objects', 'Gillian Flynn', '978-0307341556', 'Mystery & Thriller', 14.00, 38, 4.66, 2006, 'Reporter Camille Preaker returns to her hometown to cover unsolved child murders.'),
('Shutter Island', 'Dennis Lehane', '978-0061898815', 'Mystery & Thriller', 15.50, 42, 4.78, 2003, 'US Marshal Teddy Daniels investigates the escape of a murderess from an asylum fortress.'),
('The Maltese Falcon', 'Dashiell Hammett', '978-0679722649', 'Mystery & Thriller', 12.99, 32, 4.70, 1930, 'Sam Spade pursues a jewel-encrusted statuette through San Francisco underworld.'),
('Tinker Tailor Soldier Spy', 'John le Carre', '978-0143120933', 'Mystery & Thriller', 16.50, 28, 4.80, 1974, 'George Smiley hunts a high-ranking Soviet mole inside the British Secret Service.'),
('Red Dragon', 'Thomas Harris', '978-0425228227', 'Mystery & Thriller', 14.50, 36, 4.74, 1981, 'FBI profiler Will Graham consults Dr. Hannibal Lecter to catch the Tooth Fairy.'),
('The Silence of the Lambs', 'Thomas Harris', '978-0312924584', 'Mystery & Thriller', 15.00, 48, 4.86, 1988, 'Clarice Starling seeks the help of Hannibal Lecter to capture serial killer Buffalo Bill.'),
('Before I Go to Sleep', 'S.J. Watson', '978-0062060563', 'Mystery & Thriller', 13.99, 34, 4.54, 2011, 'A woman suffering from anterograde amnesia wakes up each day remembering nothing.'),
('The Hound of the Baskervilles', 'Arthur Conan Doyle', '978-0140437867', 'Mystery & Thriller', 11.50, 50, 4.79, 1902, 'Sherlock Holmes investigates an ancestral curse and a demonic spectral hound on Dartmoor.'),
('Presumed Innocent', 'Scott Turow', '978-1455581177', 'Mystery & Thriller', 14.00, 26, 4.67, 1987, 'Prosecutor Rusty Sabich is accused of murdering his female colleague and lover.'),
('The Day of the Jackal', 'Frederick Forsyth', '978-0451239372', 'Mystery & Thriller', 15.00, 33, 4.81, 1971, 'An anonymous professional assassin is contracted to assassinate Charles de Gaulle.'),
('The Girl on the Train', 'Paula Hawkins', '978-1594634024', 'Mystery & Thriller', 14.50, 56, 4.58, 2015, 'Commuter Rachel Watson becomes entangled in a missing persons investigation.'),
('Mystic River', 'Dennis Lehane', '978-0062068408', 'Mystery & Thriller', 15.99, 31, 4.76, 2001, 'Childhood friends in Boston reunited by the brutal murder of an innocent daughter.'),

-- Philosophy, Psychology & Personal Growth (81-90)
('Thinking, Fast and Slow', 'Daniel Kahneman', '978-0374533557', 'Philosophy & Psychology', 18.50, 45, 4.84, 2011, 'Nobel laureate explores System 1 intuition vs System 2 deliberative thought.'),
('Man''s Search for Meaning', 'Viktor E. Frankl', '978-0807014295', 'Philosophy & Psychology', 13.99, 60, 4.91, 1946, 'Psychiatrist finds purpose and human resilience surviving concentration camps.'),
('Meditations', 'Marcus Aurelius', '978-0812968255', 'Philosophy & Psychology', 11.99, 65, 4.88, 180, 'Private stoic reflections on virtue, duty, death, and tranquility from Roman Emperor.'),
('Beyond Good and Evil', 'Friedrich Nietzsche', '978-0140449235', 'Philosophy & Psychology', 12.50, 35, 4.72, 1886, 'A critique of traditional morality and exploration of the will to power.'),
('Atomic Habits', 'James Clear', '978-0735211292', 'Philosophy & Psychology', 17.00, 80, 4.93, 2018, 'Actionable framework for tiny changes that yield remarkable compound results.'),
('The Power of Habit', 'Charles Duhigg', '978-0812981605', 'Philosophy & Psychology', 16.50, 42, 4.77, 2012, 'The neurology of habit loops (cue, routine, reward) in individuals and organizations.'),
('Flow: The Psychology of Optimal Experience', 'Mihaly Csikszentmihalyi', '978-0061339202', 'Philosophy & Psychology', 15.99, 30, 4.80, 1990, 'The mental state of total absorption and peak performance.'),
('Quiet: The Power of Introverts', 'Susan Cain', '978-0307352156', 'Philosophy & Psychology', 16.00, 38, 4.76, 2012, 'How the extrovert ideal undervalues introverted leadership and deep thinking.'),
('Guns, Germs, and Steel', 'Jared Diamond', '978-0393354324', 'Philosophy & Psychology', 18.99, 32, 4.71, 1997, 'Geographic and environmental factors that shaped the fates of human societies.'),
('Sapiens: A Brief History of Humankind', 'Yuval Noah Harari', '978-0062316097', 'Philosophy & Psychology', 19.50, 75, 4.89, 2014, 'How an insignificant ape became the master of planet Earth through shared myths.'),

-- Economics, Business & Strategy (91-100)
('Zero to One', 'Peter Thiel & Blake Masters', '978-0804139298', 'Economics & Business', 17.50, 50, 4.81, 2014, 'Notes on startups and how to build breakthrough vertical monopolies.'),
('The Lean Startup', 'Eric Ries', '978-0307887894', 'Economics & Business', 18.00, 48, 4.73, 2011, 'Continuous innovation through Minimum Viable Products and Build-Measure-Learn loops.'),
('Good to Great', 'Jim Collins', '978-0066620992', 'Economics & Business', 19.99, 40, 4.76, 2001, 'Why some companies make the leap to sustained excellence and others do not.'),
('Thinking in Systems: A Primer', 'Donella H. Meadows', '978-1603580557', 'Economics & Business', 16.99, 36, 4.87, 2008, 'Feedback loops, stock and flow models, and systemic leverage points.'),
('Freakonomics', 'Steven D. Levitt & Stephen J. Dubner', '978-0060731335', 'Economics & Business', 15.50, 52, 4.70, 2005, 'Rogue economics exploring the hidden incentives beneath everyday phenomena.'),
('Principles: Life and Work', 'Ray Dalio', '978-1501124020', 'Economics & Business', 22.50, 45, 4.82, 2017, 'Bridgewater founder on radical transparency and systematic decision making.'),
('The Innovator''s Dilemma', 'Clayton M. Christensen', '978-1633691780', 'Economics & Business', 19.00, 30, 4.78, 1997, 'How great market leaders fail by doing everything right in the face of disruption.'),
('The Psychology of Money', 'Morgan Housel', '978-0857197689', 'Economics & Business', 16.00, 70, 4.90, 2020, 'Timeless lessons on wealth, greed, and happiness through behavioral finance.'),
('Shoe Dog: A Memoir by the Creator of Nike', 'Phil Knight', '978-1501135927', 'Economics & Business', 17.99, 55, 4.89, 2016, 'The turbulent early journey and startup trials building Nike from the trunk of a car.'),
('High Output Management', 'Andrew S. Grove', '978-0679762881', 'Economics & Business', 16.50, 35, 4.86, 1983, 'Intel legendary CEO on managerial leverage, meetings, and operational efficiency.')
ON CONFLICT (isbn) DO NOTHING;
