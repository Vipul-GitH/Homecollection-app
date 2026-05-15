-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Host: 127.0.0.1
-- Generation Time: May 15, 2026 at 11:18 AM
-- Server version: 10.4.32-MariaDB
-- PHP Version: 8.0.30

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Database: `lead_management`
--

-- --------------------------------------------------------

--
-- Table structure for table `tag_master`
--

CREATE TABLE `tag_master` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `tag_name` varchar(120) NOT NULL,
  `allow_in_permanent` tinyint(1) NOT NULL DEFAULT 0,
  `allow_in_transactional` tinyint(1) NOT NULL DEFAULT 0,
  `allow_in_patient_tag` tinyint(1) NOT NULL DEFAULT 0,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `tag_master`
--

INSERT INTO `tag_master` (`id`, `tag_name`, `allow_in_permanent`, `allow_in_transactional`, `allow_in_patient_tag`, `is_active`, `created_at`, `updated_at`) VALUES
(1, 'non fasting', 0, 1, 0, 1, '2026-04-28 05:43:01', '2026-04-28 05:43:01'),
(2, 'send senior phlebo', 1, 0, 0, 1, '2026-04-28 05:43:01', '2026-04-28 05:43:01'),
(3, 'use butterfly needle', 1, 0, 1, 1, '2026-04-28 05:43:01', '2026-04-28 05:43:01'),
(4, 'dont take pp charges', 1, 1, 0, 1, '2026-04-28 05:43:01', '2026-04-28 05:43:01'),
(5, '75g glucose', 0, 1, 0, 1, '2026-04-28 05:43:01', '2026-04-28 05:43:01'),
(6, '50 g glucose', 0, 1, 0, 1, '2026-04-28 05:43:01', '2026-04-28 05:43:01'),
(7, '100g glucose', 0, 1, 0, 1, '2026-04-28 05:43:01', '2026-04-28 05:43:01'),
(8, 'first time be careful', 0, 1, 0, 1, '2026-04-28 05:43:01', '2026-04-28 05:43:01'),
(9, 'regular be safe and carefull', 1, 0, 0, 1, '2026-04-28 05:43:01', '2026-04-28 05:43:01'),
(10, 'high value', 0, 1, 0, 1, '2026-04-28 05:43:01', '2026-04-28 05:43:01'),
(11, 'child collection', 0, 1, 0, 1, '2026-04-28 05:43:01', '2026-04-28 05:43:01'),
(12, 'special assistance', 1, 0, 1, 1, '2026-04-28 05:43:01', '2026-04-28 05:43:01'),
(13, 'vip(high priority)', 1, 0, 0, 1, '2026-04-28 05:43:01', '2026-04-28 05:43:01'),
(14, 'vvip(top priority)', 1, 0, 0, 1, '2026-04-28 05:43:01', '2026-04-28 05:43:01'),
(15, 'urgent report', 0, 1, 0, 1, '2026-04-28 05:43:01', '2026-04-28 05:43:01'),
(16, 'urgent collection', 0, 1, 0, 1, '2026-04-28 05:43:01', '2026-04-28 05:43:01'),
(17, 'previous complaint delay', 0, 1, 0, 1, '2026-04-28 05:43:01', '2026-04-28 05:43:01'),
(18, 'previous complaint prick', 0, 1, 0, 1, '2026-04-28 05:43:01', '2026-04-28 05:43:01');

--
-- Indexes for dumped tables
--

--
-- Indexes for table `tag_master`
--
ALTER TABLE `tag_master`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_tag_master_tag_name` (`tag_name`),
  ADD KEY `idx_tag_master_active` (`is_active`),
  ADD KEY `idx_tag_master_permanent` (`allow_in_permanent`,`is_active`),
  ADD KEY `idx_tag_master_transactional` (`allow_in_transactional`,`is_active`),
  ADD KEY `idx_tag_master_patient` (`allow_in_patient_tag`,`is_active`);

--
-- AUTO_INCREMENT for dumped tables
--

--
-- AUTO_INCREMENT for table `tag_master`
--
ALTER TABLE `tag_master`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=20;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
