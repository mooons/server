<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2016-2024 Nextcloud GmbH and Nextcloud contributors
 * SPDX-FileCopyrightText: 2016 ownCloud, Inc.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace Test\Http\Client;

use OC\Http\Client\Client;
use OC\Http\Client\ClientService;
use OC\Http\Client\DnsPinMiddleware;
use OCP\Diagnostics\IEventLogger;
use OCP\ICertificateManager;
use OCP\IConfig;
use OCP\Security\IRemoteHostValidator;
use OCP\ServerVersion;
use Psr\Log\LoggerInterface;

/**
 * Class ClientServiceTest
 */
class ClientServiceTest extends \Test\TestCase {
	public function testNewClient(): void {
		/** @var IConfig $config */
		$config = $this->createMock(IConfig::class);
		$config->method('getSystemValueBool')
			->with('dns_pinning', true)
			->willReturn(true);
		/** @var ICertificateManager $certificateManager */
		$certificateManager = $this->createMock(ICertificateManager::class);
		$dnsPinMiddleware = $this->createMock(DnsPinMiddleware::class);
		$dnsPinMiddleware
			->expects($this->atLeastOnce())
			->method('addDnsPinning')
			->willReturn(function (): void {
			});
		$remoteHostValidator = $this->createMock(IRemoteHostValidator::class);
		$eventLogger = $this->createMock(IEventLogger::class);
		$logger = $this->createMock(LoggerInterface::class);
		$serverVersion = $this->createMock(ServerVersion::class);

		$clientService = new ClientService(
			$config,
			$certificateManager,
			$dnsPinMiddleware,
			$remoteHostValidator,
			$eventLogger,
			$logger,
			$serverVersion,
		);

		$this->assertInstanceOf(Client::class, $clientService->newClient());
	}

	public function testDisableDnsPinning(): void {
		/** @var IConfig $config */
		$config = $this->createMock(IConfig::class);
		$config->method('getSystemValueBool')
			->with('dns_pinning', true)
			->willReturn(false);
		/** @var ICertificateManager $certificateManager */
		$certificateManager = $this->createMock(ICertificateManager::class);
		$dnsPinMiddleware = $this->createMock(DnsPinMiddleware::class);
		$dnsPinMiddleware
			->expects($this->never())
			->method('addDnsPinning')
			->willReturn(function (): void {
			});
		$remoteHostValidator = $this->createMock(IRemoteHostValidator::class);
		$eventLogger = $this->createMock(IEventLogger::class);
		$logger = $this->createMock(LoggerInterface::class);
		$serverVersion = $this->createMock(ServerVersion::class);

		$clientService = new ClientService(
			$config,
			$certificateManager,
			$dnsPinMiddleware,
			$remoteHostValidator,
			$eventLogger,
			$logger,
			$serverVersion,
		);

		$this->assertInstanceOf(Client::class, $clientService->newClient());
	}
}
