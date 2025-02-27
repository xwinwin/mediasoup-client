/**
 * This test runs in Node so no browser auto-detection is done. Instead, a
 * FakeHandler device is used.
 */

import * as sdpTransform from 'sdp-transform';
import { FakeMediaStreamTrack } from 'fake-mediastreamtrack';
import * as mediasoupClient from '../';
import { UnsupportedError, InvalidStateError } from '../errors';
import * as utils from '../utils';
import { RemoteSdp } from '../handlers/sdp/RemoteSdp';
import { FakeHandler } from '../handlers/FakeHandler';
import { RtpCapabilities } from '../RtpParameters';
import * as fakeParameters from './fakeParameters';
import { uaTestCases } from './uaTestCases';

const { Device, detectDevice, parseScalabilityMode, debug } = mediasoupClient;

type TestContext = {
	device?: mediasoupClient.types.Device;
	loadedDevice?: mediasoupClient.types.Device;
	sendTransport?: mediasoupClient.types.Transport;
	connectedSendTransport?: mediasoupClient.types.Transport;
	recvTransport?: mediasoupClient.types.Transport;
	connectedRecvTransport?: mediasoupClient.types.Transport;
	audioProducer?: mediasoupClient.types.Producer;
	videoProducer?: mediasoupClient.types.Producer;
	audioConsumer?: mediasoupClient.types.Consumer;
	videoConsumer?: mediasoupClient.types.Consumer;
	dataProducer?: mediasoupClient.types.DataProducer;
	dataConsumer?: mediasoupClient.types.DataConsumer;
};

const ctx: TestContext = {};

beforeEach(async () => {
	ctx.device = new Device({
		handlerFactory: FakeHandler.createFactory(fakeParameters),
	});

	ctx.loadedDevice = new Device({
		handlerFactory: FakeHandler.createFactory(fakeParameters),
	});

	const routerRtpCapabilities = fakeParameters.generateRouterRtpCapabilities();

	// Only load loadedDevice.
	await ctx.loadedDevice.load({ routerRtpCapabilities });

	const { id, iceParameters, iceCandidates, dtlsParameters, sctpParameters } =
		fakeParameters.generateTransportRemoteParameters();

	ctx.sendTransport = ctx.loadedDevice.createSendTransport<{ foo: number }>({
		id,
		iceParameters,
		iceCandidates,
		dtlsParameters,
		sctpParameters,
	});

	ctx.connectedSendTransport = ctx.loadedDevice.createSendTransport<{
		foo: number;
	}>({
		id,
		iceParameters,
		iceCandidates,
		dtlsParameters,
		sctpParameters,
	});

	ctx.connectedSendTransport.on(
		'connect',
		// eslint-disable-next-line no-shadow, @typescript-eslint/no-unused-vars
		({ dtlsParameters }, callback /* errback */) => {
			setTimeout(callback);
		}
	);

	ctx.connectedSendTransport.on(
		'produce',
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		({ kind, rtpParameters, appData }, callback /* errback */) => {
			// eslint-disable-next-line no-shadow
			const id = fakeParameters.generateProducerRemoteParameters().id;

			setTimeout(() => callback({ id }));
		}
	);

	ctx.connectedSendTransport.on(
		'producedata',
		(
			// eslint-disable-next-line @typescript-eslint/no-unused-vars
			{ sctpStreamParameters, label, protocol, appData },
			callback /* errback */
		) => {
			// eslint-disable-next-line no-shadow
			const id = fakeParameters.generateDataProducerRemoteParameters().id;

			setTimeout(() => callback({ id }));
		}
	);

	ctx.recvTransport = ctx.loadedDevice.createRecvTransport({
		id,
		iceParameters,
		iceCandidates,
		dtlsParameters,
		sctpParameters,
	});

	ctx.connectedRecvTransport = ctx.loadedDevice.createRecvTransport({
		id,
		iceParameters,
		iceCandidates,
		dtlsParameters,
		sctpParameters,
	});

	ctx.connectedRecvTransport.on(
		'connect',
		// eslint-disable-next-line no-shadow, @typescript-eslint/no-unused-vars
		({ dtlsParameters }, callback /* errback */) => {
			setTimeout(callback);
		}
	);

	const audioTrack = new FakeMediaStreamTrack({ kind: 'audio' });

	ctx.audioProducer = await ctx.connectedSendTransport.produce({
		track: audioTrack,
		stopTracks: false,
	});

	const videoTrack = new FakeMediaStreamTrack({ kind: 'video' });

	ctx.videoProducer = await ctx.connectedSendTransport.produce({
		track: videoTrack,
	});

	const audioConsumerRemoteParameters =
		fakeParameters.generateConsumerRemoteParameters({
			codecMimeType: 'audio/opus',
		});

	ctx.audioConsumer = await ctx.connectedRecvTransport.consume({
		id: audioConsumerRemoteParameters.id,
		producerId: audioConsumerRemoteParameters.producerId,
		kind: audioConsumerRemoteParameters.kind,
		rtpParameters: audioConsumerRemoteParameters.rtpParameters,
	});

	const videoConsumerRemoteParameters =
		fakeParameters.generateConsumerRemoteParameters({
			codecMimeType: 'video/VP8',
		});

	ctx.videoConsumer = await ctx.connectedRecvTransport.consume({
		id: videoConsumerRemoteParameters.id,
		producerId: videoConsumerRemoteParameters.producerId,
		kind: videoConsumerRemoteParameters.kind,
		rtpParameters: videoConsumerRemoteParameters.rtpParameters,
	});

	ctx.dataProducer = await ctx.connectedSendTransport.produceData({
		ordered: false,
		maxPacketLifeTime: 5555,
	});

	const dataConsumerRemoteParameters =
		fakeParameters.generateDataConsumerRemoteParameters();

	ctx.dataConsumer = await ctx.connectedRecvTransport!.consumeData({
		id: dataConsumerRemoteParameters.id,
		dataProducerId: dataConsumerRemoteParameters.dataProducerId,
		sctpStreamParameters: dataConsumerRemoteParameters.sctpStreamParameters,
	});
});

test('mediasoup-client exposes debug dependency', () => {
	expect(typeof debug).toBe('function');
}, 500);

test('detectDevice() returns nothing in Node', () => {
	expect(detectDevice()).toBe(undefined);
});

test('create a Device in Node without custom handlerName/handlerFactory throws UnsupportedError', () => {
	expect(() => new Device()).toThrow(UnsupportedError);
});

test('create a Device with an unknown handlerName string throws TypeError', () => {
	// @ts-expect-error --- On purpose.
	expect(() => new Device({ handlerName: 'FooBrowser666' })).toThrow(TypeError);
});

test('create a Device in Node with a valid handlerFactory succeeds', () => {
	const device = new Device({
		handlerFactory: FakeHandler.createFactory(fakeParameters),
	});

	expect(typeof device).toBe('object');
	expect(device.handlerName).toBe('FakeHandler');
	expect(device.loaded).toBe(false);
});

test('device.rtpCapabilities getter throws InvalidStateError if not loaded', () => {
	expect(() => ctx.device!.rtpCapabilities).toThrow(InvalidStateError);
});

test('device.sctpCapabilities getter throws InvalidStateError if not loaded', () => {
	expect(() => ctx.device!.sctpCapabilities).toThrow(InvalidStateError);
});

test('device.canProduce() throws InvalidStateError if not loaded', () => {
	expect(() => ctx.device!.canProduce('audio')).toThrow(InvalidStateError);
});

test('device.createSendTransport() throws InvalidStateError if not loaded', () => {
	const { id, iceParameters, iceCandidates, dtlsParameters, sctpParameters } =
		fakeParameters.generateTransportRemoteParameters();

	expect(() =>
		ctx.device!.createSendTransport({
			id,
			iceParameters,
			iceCandidates,
			dtlsParameters,
			sctpParameters,
		})
	).toThrow(InvalidStateError);
});

test('device.load() without routerRtpCapabilities rejects with TypeError', async () => {
	// @ts-expect-error --- On purpose.
	await expect(ctx.device!.load({})).rejects.toThrow(TypeError);

	expect(ctx.device!.loaded).toBe(false);
}, 500);

test('device.load() with invalid routerRtpCapabilities rejects with TypeError', async () => {
	// Clone fake router RTP capabilities to make them invalid.
	const routerRtpCapabilities = utils.clone<RtpCapabilities>(
		fakeParameters.generateRouterRtpCapabilities()
	);

	for (const codec of routerRtpCapabilities.codecs!) {
		// @ts-expect-error --- On purpose.
		delete codec!.mimeType;
	}

	await expect(ctx.device!.load({ routerRtpCapabilities })).rejects.toThrow(
		TypeError
	);

	expect(ctx.device!.loaded).toBe(false);
}, 500);

test('device.load() succeeds', async () => {
	// Assume we get the router RTP capabilities.
	const routerRtpCapabilities = fakeParameters.generateRouterRtpCapabilities();

	await expect(ctx.device!.load({ routerRtpCapabilities })).resolves.toBe(
		undefined
	);

	expect(ctx.device!.loaded).toBe(true);
}, 500);

test('device.load() rejects with InvalidStateError if already loaded', async () => {
	const routerRtpCapabilities = fakeParameters.generateRouterRtpCapabilities();

	await expect(
		ctx.loadedDevice!.load({ routerRtpCapabilities })
	).rejects.toThrow(InvalidStateError);

	expect(ctx.loadedDevice!.loaded).toBe(true);
}, 500);

test('device.rtpCapabilities getter succeeds', () => {
	expect(typeof ctx.loadedDevice!.rtpCapabilities).toBe('object');
});

test('device.sctpCapabilities getter succeeds', () => {
	expect(typeof ctx.loadedDevice!.sctpCapabilities).toBe('object');
});

test('device.canProduce() with "audio"/"video" kind returns true', () => {
	expect(ctx.loadedDevice!.canProduce('audio')).toBe(true);
	expect(ctx.loadedDevice!.canProduce('video')).toBe(true);
});

test('device.canProduce() with invalid kind throws TypeError', () => {
	// @ts-expect-error --- On purpose.
	expect(() => ctx.loadedDevice!.canProduce('chicken')).toThrow(TypeError);
});

test('device.createSendTransport() for sending media succeeds', () => {
	// Assume we create a transport in the server and get its remote parameters.
	const { id, iceParameters, iceCandidates, dtlsParameters, sctpParameters } =
		fakeParameters.generateTransportRemoteParameters();

	const sendTransport = ctx.loadedDevice!.createSendTransport<{ foo: number }>({
		id,
		iceParameters,
		iceCandidates,
		dtlsParameters,
		sctpParameters,
		appData: { foo: 123 },
	});

	expect(typeof sendTransport).toBe('object');
	expect(sendTransport.id).toBe(id);
	expect(sendTransport.closed).toBe(false);
	expect(sendTransport.direction).toBe('send');
	expect(typeof sendTransport.handler).toBe('object');
	expect(sendTransport.handler instanceof FakeHandler).toBe(true);
	expect(sendTransport.connectionState).toBe('new');
	expect(sendTransport.appData).toEqual({ foo: 123 });
});

test('device.createRecvTransport() for receiving media succeeds', () => {
	// Assume we create a transport in the server and get its remote parameters.
	const { id, iceParameters, iceCandidates, dtlsParameters, sctpParameters } =
		fakeParameters.generateTransportRemoteParameters();

	const recvTransport = ctx.loadedDevice!.createRecvTransport({
		id,
		iceParameters,
		iceCandidates,
		dtlsParameters,
		sctpParameters,
	});

	expect(typeof recvTransport).toBe('object');
	expect(recvTransport.id).toBe(id);
	expect(recvTransport.closed).toBe(false);
	expect(recvTransport.direction).toBe('recv');
	expect(typeof recvTransport.handler).toBe('object');
	expect(recvTransport.handler instanceof FakeHandler).toBe(true);
	expect(recvTransport.connectionState).toBe('new');
	expect(recvTransport.appData).toEqual({});
});

test('device.createSendTransport() with missing remote Transport parameters throws TypeError', () => {
	// @ts-expect-error --- On purpose.
	expect(() => ctx.loadedDevice!.createSendTransport({ id: '1234' })).toThrow(
		TypeError
	);

	expect(() =>
		// @ts-expect-error --- On purpose.
		ctx.loadedDevice!.createSendTransport({ id: '1234', iceParameters: {} })
	).toThrow(TypeError);

	expect(() =>
		ctx.loadedDevice!.createSendTransport({
			id: '1234',
			// @ts-expect-error --- On purpose.
			iceParameters: {},
			iceCandidates: [],
		})
	).toThrow(TypeError);
});

test('device.createRecvTransport() with a non object appData throws TypeError', () => {
	const { id, iceParameters, iceCandidates, dtlsParameters, sctpParameters } =
		fakeParameters.generateTransportRemoteParameters();

	expect(() =>
		ctx.loadedDevice!.createRecvTransport({
			id,
			iceParameters,
			iceCandidates,
			dtlsParameters,
			sctpParameters,
			// @ts-expect-error --- On purpose.
			appData: 1234,
		})
	).toThrow(TypeError);
});

test('transport.produce() without "produce" listener rejects', async () => {
	const audioTrack = new FakeMediaStreamTrack({ kind: 'audio' });

	ctx.sendTransport!.removeAllListeners('produce');

	await expect(
		ctx.sendTransport!.produce({ track: audioTrack })
	).rejects.toThrow(Error);
}, 500);

test('transport.produce() succeeds', async () => {
	const audioTrack = new FakeMediaStreamTrack({ kind: 'audio' });
	const videoTrack = new FakeMediaStreamTrack({ kind: 'video' });
	let connectEventNumTimesCalled = 0;
	let produceEventNumTimesCalled = 0;
	let codecs;
	let headerExtensions;
	let encodings;
	let rtcp;

	// Pause the audio track before creating its Producer.
	audioTrack.enabled = false;

	ctx.connectedSendTransport!.prependListener(
		'connect',
		() => ++connectEventNumTimesCalled
	);

	ctx.connectedSendTransport!.prependListener(
		'produce',
		() => ++produceEventNumTimesCalled
	);

	// Use stopTracks: false.
	const audioProducer = await ctx.connectedSendTransport!.produce<{
		foo: string;
	}>({
		track: audioTrack,
		stopTracks: false,
		appData: { foo: 'FOO' },
	});

	// 'connect' event should not have been called since it was in beforeEach
	// already.
	expect(connectEventNumTimesCalled).toBe(0);
	expect(produceEventNumTimesCalled).toBe(1);
	expect(typeof audioProducer).toBe('object');
	expect(typeof audioProducer.id).toBe('string');
	expect(audioProducer.closed).toBe(false);
	expect(audioProducer.kind).toBe('audio');
	expect(audioProducer.track).toBe(audioTrack);
	expect(typeof audioProducer.rtpParameters).toBe('object');
	expect(typeof audioProducer.rtpParameters.mid).toBe('string');
	expect(audioProducer.rtpParameters.codecs.length).toBe(1);

	codecs = audioProducer.rtpParameters.codecs;

	expect(codecs[0]).toEqual({
		mimeType: 'audio/opus',
		payloadType: 111,
		clockRate: 48000,
		channels: 2,
		rtcpFeedback: [{ type: 'transport-cc', parameter: '' }],
		parameters: {
			minptime: 10,
			useinbandfec: 1,
		},
	});

	headerExtensions = audioProducer.rtpParameters.headerExtensions;

	expect(headerExtensions).toEqual([
		{
			uri: 'urn:ietf:params:rtp-hdrext:sdes:mid',
			id: 1,
			encrypt: false,
			parameters: {},
		},
		{
			uri: 'urn:ietf:params:rtp-hdrext:ssrc-audio-level',
			id: 10,
			encrypt: false,
			parameters: {},
		},
	]);

	encodings = audioProducer.rtpParameters.encodings;

	expect(Array.isArray(encodings)).toBe(true);
	expect(encodings!.length).toBe(1);
	expect(typeof encodings?.[0]).toBe('object');
	expect(Object.keys(encodings![0])).toEqual(['ssrc', 'dtx']);
	expect(typeof encodings?.[0].ssrc).toBe('number');

	rtcp = audioProducer.rtpParameters.rtcp;

	expect(typeof rtcp).toBe('object');
	expect(typeof rtcp?.cname).toBe('string');

	expect(audioProducer.paused).toBe(true);
	expect(audioProducer.maxSpatialLayer).toBe(undefined);
	expect(audioProducer.appData).toEqual({ foo: 'FOO' });

	// Reset the audio paused state.
	audioProducer.resume();

	const videoEncodings = [{ maxBitrate: 100000 }, { maxBitrate: 500000 }];

	// Note that stopTracks is not given so it's true by default.
	// Use disableTrackOnPause: false and zeroRtpOnPause: true
	const videoProducer = await ctx.connectedSendTransport!.produce({
		track: videoTrack,
		encodings: videoEncodings,
		disableTrackOnPause: false,
		zeroRtpOnPause: true,
	});

	expect(connectEventNumTimesCalled).toBe(0);
	expect(produceEventNumTimesCalled).toBe(2);
	expect(typeof videoProducer).toBe('object');
	expect(typeof videoProducer.id).toBe('string');
	expect(videoProducer.closed).toBe(false);
	expect(videoProducer.kind).toBe('video');
	expect(videoProducer.track).toBe(videoTrack);
	expect(typeof videoProducer.rtpParameters).toBe('object');
	expect(typeof videoProducer.rtpParameters.mid).toBe('string');
	expect(videoProducer.rtpParameters.codecs.length).toBe(2);

	codecs = videoProducer.rtpParameters.codecs;

	expect(codecs[0]).toEqual({
		mimeType: 'video/VP8',
		payloadType: 96,
		clockRate: 90000,
		rtcpFeedback: [
			{ type: 'goog-remb', parameter: '' },
			{ type: 'transport-cc', parameter: '' },
			{ type: 'ccm', parameter: 'fir' },
			{ type: 'nack', parameter: '' },
			{ type: 'nack', parameter: 'pli' },
		],
		parameters: {
			baz: '1234abcd',
		},
	});

	expect(codecs[1]).toEqual({
		mimeType: 'video/rtx',
		payloadType: 97,
		clockRate: 90000,
		rtcpFeedback: [],
		parameters: {
			apt: 96,
		},
	});

	headerExtensions = videoProducer.rtpParameters.headerExtensions;

	expect(headerExtensions).toEqual([
		{
			uri: 'urn:ietf:params:rtp-hdrext:sdes:mid',
			id: 1,
			encrypt: false,
			parameters: {},
		},
		{
			uri: 'http://www.webrtc.org/experiments/rtp-hdrext/abs-send-time',
			id: 3,
			encrypt: false,
			parameters: {},
		},
		{
			uri: 'http://www.ietf.org/id/draft-holmer-rmcat-transport-wide-cc-extensions-01',
			id: 5,
			encrypt: false,
			parameters: {},
		},
		{
			uri: 'urn:3gpp:video-orientation',
			id: 4,
			encrypt: false,
			parameters: {},
		},
		{
			uri: 'urn:ietf:params:rtp-hdrext:toffset',
			id: 2,
			encrypt: false,
			parameters: {},
		},
	]);

	encodings = videoProducer.rtpParameters.encodings;

	expect(Array.isArray(encodings)).toBe(true);
	expect(encodings!.length).toBe(2);
	expect(typeof encodings?.[0]).toBe('object');
	expect(typeof encodings?.[0].ssrc).toBe('number');
	expect(typeof encodings?.[0].rtx).toBe('object');
	expect(Object.keys(encodings![0].rtx!)).toEqual(['ssrc']);
	expect(typeof encodings?.[0].rtx?.ssrc).toBe('number');
	expect(typeof encodings?.[1]).toBe('object');
	expect(typeof encodings?.[1].ssrc).toBe('number');
	expect(typeof encodings?.[1].rtx).toBe('object');
	expect(Object.keys(encodings![1].rtx!)).toEqual(['ssrc']);
	expect(typeof encodings?.[1].rtx?.ssrc).toBe('number');

	rtcp = videoProducer.rtpParameters.rtcp;

	expect(typeof rtcp).toBe('object');
	expect(typeof rtcp?.cname).toBe('string');

	expect(videoProducer.paused).toBe(false);
	expect(videoProducer.maxSpatialLayer).toBe(undefined);
	expect(videoProducer.appData).toEqual({});
}, 500);

test('transport.produce() without track rejects with TypeError', async () => {
	await expect(ctx.sendTransport!.produce({})).rejects.toThrow(TypeError);
}, 500);

test('transport.produce() in a receiving Transport rejects with UnsupportedError', async () => {
	const track = new FakeMediaStreamTrack({ kind: 'audio' });

	await expect(ctx.recvTransport!.produce({ track })).rejects.toThrow(
		UnsupportedError
	);
}, 500);

test('transport.produce() with an ended track rejects with InvalidStateError', async () => {
	const track = new FakeMediaStreamTrack({ kind: 'audio' });

	track.stop();

	await expect(ctx.sendTransport!.produce({ track })).rejects.toThrow(
		InvalidStateError
	);
}, 500);

test('transport.produce() with a non object appData rejects with TypeError', async () => {
	const track = new FakeMediaStreamTrack({ kind: 'audio' });

	await expect(
		// @ts-expect-error --- On purpose.
		ctx.sendTransport!.produce({ track, appData: true })
	).rejects.toThrow(TypeError);
}, 500);

test('transport.consume() succeeds', async () => {
	const audioConsumerRemoteParameters =
		fakeParameters.generateConsumerRemoteParameters({
			codecMimeType: 'audio/opus',
		});
	const videoConsumerRemoteParameters =
		fakeParameters.generateConsumerRemoteParameters({
			codecMimeType: 'video/VP8',
		});

	let connectEventNumTimesCalled = 0;
	let codecs;
	let headerExtensions;
	let encodings;
	let rtcp;

	ctx.connectedRecvTransport!.prependListener(
		'connect',
		() => ++connectEventNumTimesCalled
	);

	const audioConsumer = await ctx.connectedRecvTransport!.consume<{
		bar: string;
	}>({
		id: audioConsumerRemoteParameters.id,
		producerId: audioConsumerRemoteParameters.producerId,
		kind: audioConsumerRemoteParameters.kind,
		rtpParameters: audioConsumerRemoteParameters.rtpParameters,
		appData: { bar: 'BAR' },
	});

	// 'connect' event should not have been called since it was in beforeEach
	// already.
	expect(connectEventNumTimesCalled).toBe(0);
	expect(typeof audioConsumer).toBe('object');
	expect(audioConsumer.id).toBe(audioConsumerRemoteParameters.id);
	expect(audioConsumer.producerId).toBe(
		audioConsumerRemoteParameters.producerId
	);
	expect(audioConsumer.closed).toBe(false);
	expect(audioConsumer.kind).toBe('audio');
	expect(typeof audioConsumer.track).toBe('object');
	expect(typeof audioConsumer.rtpParameters).toBe('object');
	expect(audioConsumer.rtpParameters.mid).toBe(undefined);
	expect(audioConsumer.rtpParameters.codecs.length).toBe(1);

	codecs = audioConsumer.rtpParameters.codecs;

	expect(codecs[0]).toEqual({
		mimeType: 'audio/opus',
		payloadType: 100,
		clockRate: 48000,
		channels: 2,
		rtcpFeedback: [{ type: 'transport-cc', parameter: '' }],
		parameters: {
			useinbandfec: 1,
			foo: 'bar',
		},
	});

	headerExtensions = audioConsumer.rtpParameters.headerExtensions;

	expect(headerExtensions).toEqual([
		{
			uri: 'urn:ietf:params:rtp-hdrext:sdes:mid',
			id: 1,
			encrypt: false,
			parameters: {},
		},
		{
			uri: 'http://www.ietf.org/id/draft-holmer-rmcat-transport-wide-cc-extensions-01',
			id: 5,
			encrypt: false,
			parameters: {},
		},
		{
			uri: 'urn:ietf:params:rtp-hdrext:ssrc-audio-level',
			id: 10,
			encrypt: false,
			parameters: {},
		},
	]);

	encodings = audioConsumer.rtpParameters.encodings;

	expect(Array.isArray(encodings)).toBe(true);
	expect(encodings!.length).toBe(1);
	expect(typeof encodings?.[0]).toBe('object');
	expect(Object.keys(encodings![0])).toEqual(['ssrc', 'dtx']);
	expect(typeof encodings![0].ssrc).toBe('number');

	rtcp = audioConsumer.rtpParameters.rtcp;

	expect(typeof rtcp).toBe('object');
	expect(typeof rtcp?.cname).toBe('string');

	expect(audioConsumer.paused).toBe(false);
	expect(audioConsumer.appData).toEqual({ bar: 'BAR' });

	const videoConsumer = await ctx.connectedRecvTransport!.consume({
		id: videoConsumerRemoteParameters.id,
		producerId: videoConsumerRemoteParameters.producerId,
		kind: videoConsumerRemoteParameters.kind,
		rtpParameters: videoConsumerRemoteParameters.rtpParameters,
	});

	expect(connectEventNumTimesCalled).toBe(0);
	expect(typeof videoConsumer).toBe('object');
	expect(videoConsumer.id).toBe(videoConsumerRemoteParameters.id);
	expect(videoConsumer.producerId).toBe(
		videoConsumerRemoteParameters.producerId
	);
	expect(videoConsumer.closed).toBe(false);
	expect(videoConsumer.kind).toBe('video');
	expect(typeof videoConsumer.track).toBe('object');
	expect(typeof videoConsumer.rtpParameters).toBe('object');
	expect(videoConsumer.rtpParameters.mid).toBe(undefined);
	expect(videoConsumer.rtpParameters.codecs.length).toBe(2);

	codecs = videoConsumer.rtpParameters.codecs;

	expect(codecs[0]).toEqual({
		mimeType: 'video/VP8',
		payloadType: 101,
		clockRate: 90000,
		rtcpFeedback: [
			{ type: 'nack', parameter: '' },
			{ type: 'nack', parameter: 'pli' },
			{ type: 'ccm', parameter: 'fir' },
			{ type: 'goog-remb', parameter: '' },
			{ type: 'transport-cc', parameter: '' },
		],
		parameters: {
			'x-google-start-bitrate': 1500,
		},
	});

	expect(codecs[1]).toEqual({
		mimeType: 'video/rtx',
		payloadType: 102,
		clockRate: 90000,
		rtcpFeedback: [],
		parameters: {
			apt: 101,
		},
	});

	headerExtensions = videoConsumer.rtpParameters.headerExtensions;

	expect(headerExtensions).toEqual([
		{
			uri: 'urn:ietf:params:rtp-hdrext:sdes:mid',
			id: 1,
			encrypt: false,
			parameters: {},
		},
		{
			uri: 'http://www.webrtc.org/experiments/rtp-hdrext/abs-send-time',
			id: 4,
			encrypt: false,
			parameters: {},
		},
		{
			uri: 'http://www.ietf.org/id/draft-holmer-rmcat-transport-wide-cc-extensions-01',
			id: 5,
			encrypt: false,
			parameters: {},
		},
		{
			uri: 'urn:3gpp:video-orientation',
			id: 11,
			encrypt: false,
			parameters: {},
		},
		{
			uri: 'urn:ietf:params:rtp-hdrext:toffset',
			id: 12,
			encrypt: false,
			parameters: {},
		},
	]);

	encodings = videoConsumer.rtpParameters.encodings;

	expect(Array.isArray(encodings)).toBe(true);
	expect(encodings!.length).toBe(1);
	expect(typeof encodings?.[0]).toBe('object');
	expect(Object.keys(encodings![0])).toEqual(['ssrc', 'rtx', 'dtx']);
	expect(typeof encodings?.[0].ssrc).toBe('number');
	expect(typeof encodings?.[0].rtx).toBe('object');
	expect(Object.keys(encodings![0].rtx!)).toEqual(['ssrc']);
	expect(typeof encodings?.[0].rtx?.ssrc).toBe('number');

	rtcp = videoConsumer.rtpParameters.rtcp;

	expect(typeof rtcp).toBe('object');
	expect(typeof rtcp?.cname).toBe('string');

	expect(videoConsumer.paused).toBe(false);
	expect(videoConsumer.appData).toEqual({});
}, 500);

test('transport.consume() batches consumers created in same macrotask into the same task', async () => {
	const videoConsumerRemoteParameters1 =
		fakeParameters.generateConsumerRemoteParameters({
			codecMimeType: 'video/VP8',
		});
	const videoConsumerRemoteParameters2 =
		fakeParameters.generateConsumerRemoteParameters({
			codecMimeType: 'video/VP8',
		});

	// @ts-expect-error --- On purpose.
	const pushSpy = jest.spyOn(ctx.connectedRecvTransport!._awaitQueue, 'push');

	const waitForConsumer = (id: string | undefined): Promise<void> => {
		return new Promise<void>(resolve => {
			ctx.connectedRecvTransport!.observer.on('newconsumer', consumer => {
				if (consumer.id === id) {
					resolve();
				}
			});
		});
	};

	const allConsumersCreated = Promise.all([
		waitForConsumer(videoConsumerRemoteParameters1.id),
		waitForConsumer(videoConsumerRemoteParameters2.id),
	]);

	await Promise.all([
		ctx.connectedRecvTransport!.consume({
			id: videoConsumerRemoteParameters1.id,
			producerId: videoConsumerRemoteParameters1.producerId,
			kind: videoConsumerRemoteParameters1.kind,
			rtpParameters: videoConsumerRemoteParameters1.rtpParameters,
		}),
		ctx.connectedRecvTransport!.consume({
			id: videoConsumerRemoteParameters2.id,
			producerId: videoConsumerRemoteParameters2.producerId,
			kind: videoConsumerRemoteParameters2.kind,
			rtpParameters: videoConsumerRemoteParameters2.rtpParameters,
		}),
	]);

	await allConsumersCreated;

	expect(pushSpy).toHaveBeenCalledTimes(1);
}, 500);

test('transport.consume() without remote Consumer parameters rejects with TypeError', async () => {
	// @ts-expect-error --- On purpose.
	await expect(ctx.recvTransport!.consume({})).rejects.toThrow(TypeError);
}, 500);

test('transport.consume() with missing remote Consumer parameters rejects with TypeError', async () => {
	// @ts-expect-error --- On purpose.
	await expect(ctx.recvTransport!.consume({ id: '1234' })).rejects.toThrow(
		TypeError
	);

	await expect(
		// @ts-expect-error --- On purpose.
		ctx.recvTransport!.consume({ id: '1234', producerId: '4444' })
	).rejects.toThrow(TypeError);

	await expect(
		ctx.recvTransport!.consume(
			// @ts-expect-error --- On purpose.
			{
				id: '1234',
				producerId: '4444',
				kind: 'audio',
			}
		)
	).rejects.toThrow(TypeError);

	await expect(
		ctx.recvTransport!.consume(
			// @ts-expect-error --- On purpose.
			{
				id: '1234',
				producerId: '4444',
				kind: 'audio',
			}
		)
	).rejects.toThrow(TypeError);
}, 500);

test('transport.consume() in a sending Transport rejects with UnsupportedError', async () => {
	const { id, producerId, kind, rtpParameters } =
		fakeParameters.generateConsumerRemoteParameters({
			codecMimeType: 'audio/opus',
		});

	await expect(
		ctx.sendTransport!.consume({
			id,
			producerId,
			kind,
			rtpParameters,
		})
	).rejects.toThrow(UnsupportedError);
}, 500);

test('transport.consume() with unsupported rtpParameters rejects with UnsupportedError', async () => {
	const { id, producerId, kind, rtpParameters } =
		fakeParameters.generateConsumerRemoteParameters({
			codecMimeType: 'audio/ISAC',
		});

	await expect(
		ctx.sendTransport!.consume({
			id,
			producerId,
			kind,
			rtpParameters,
		})
	).rejects.toThrow(UnsupportedError);
}, 500);

test('transport.consume() with a non object appData rejects with TypeError', async () => {
	const consumerRemoteParameters =
		fakeParameters.generateConsumerRemoteParameters({
			codecMimeType: 'audio/opus',
		});

	await expect(
		// @ts-expect-error --- On purpose.
		ctx.recvTransport!.consume({ consumerRemoteParameters, appData: true })
	).rejects.toThrow(TypeError);
}, 500);

test('transport.produceData() succeeds', async () => {
	let produceDataEventNumTimesCalled = 0;

	ctx.connectedSendTransport!.prependListener('producedata', () => {
		produceDataEventNumTimesCalled++;
	});

	const dataProducer = await ctx.connectedSendTransport!.produceData<{
		foo: string;
	}>({
		ordered: false,
		maxPacketLifeTime: 5555,
		label: 'FOO',
		protocol: 'BAR',
		appData: { foo: 'FOO' },
	});

	expect(produceDataEventNumTimesCalled).toBe(1);
	expect(typeof dataProducer).toBe('object');
	expect(typeof dataProducer.id).toBe('string');
	expect(dataProducer.closed).toBe(false);
	expect(typeof dataProducer.sctpStreamParameters).toBe('object');
	expect(typeof dataProducer.sctpStreamParameters.streamId).toBe('number');
	expect(dataProducer.sctpStreamParameters.ordered).toBe(false);
	expect(dataProducer.sctpStreamParameters.maxPacketLifeTime).toBe(5555);
	expect(dataProducer.sctpStreamParameters.maxRetransmits).toBe(undefined);
	expect(dataProducer.label).toBe('FOO');
	expect(dataProducer.protocol).toBe('BAR');
}, 500);

test('transport.produceData() in a receiving Transport rejects with UnsupportedError', async () => {
	await expect(ctx.recvTransport!.produceData({})).rejects.toThrow(
		UnsupportedError
	);
}, 500);

test('transport.produceData() with a non object appData rejects with TypeError', async () => {
	await expect(
		// @ts-expect-error --- On purpose.
		ctx.sendTransport!.produceData({ appData: true })
	).rejects.toThrow(TypeError);
}, 500);

test('transport.consumeData() succeeds', async () => {
	const dataConsumerRemoteParameters =
		fakeParameters.generateDataConsumerRemoteParameters();

	const dataConsumer = await ctx.connectedRecvTransport!.consumeData<{
		bar: string;
	}>({
		id: dataConsumerRemoteParameters.id,
		dataProducerId: dataConsumerRemoteParameters.dataProducerId,
		sctpStreamParameters: dataConsumerRemoteParameters.sctpStreamParameters,
		label: 'FOO',
		protocol: 'BAR',
		appData: { bar: 'BAR' },
	});

	expect(typeof dataConsumer).toBe('object');
	expect(dataConsumer.id).toBe(dataConsumerRemoteParameters.id);
	expect(dataConsumer.dataProducerId).toBe(
		dataConsumerRemoteParameters.dataProducerId
	);
	expect(dataConsumer.closed).toBe(false);
	expect(typeof dataConsumer.sctpStreamParameters).toBe('object');
	expect(typeof dataConsumer.sctpStreamParameters.streamId).toBe('number');
	expect(dataConsumer.label).toBe('FOO');
	expect(dataConsumer.protocol).toBe('BAR');
}, 500);

test('transport.consumeData() without remote DataConsumer parameters rejects with TypeError', async () => {
	// @ts-expect-error --- On purpose.
	await expect(ctx.recvTransport!.consumeData({})).rejects.toThrow(TypeError);
}, 500);

test('transport.consumeData() with missing remote DataConsumer parameters rejects with TypeError', async () => {
	// @ts-expect-error --- On purpose.
	await expect(ctx.recvTransport!.consumeData({ id: '1234' })).rejects.toThrow(
		TypeError
	);

	await expect(
		// @ts-expect-error --- On purpose.
		ctx.recvTransport!.consumeData({ id: '1234', dataProducerId: '4444' })
	).rejects.toThrow(TypeError);
}, 500);

test('transport.consumeData() in a sending Transport rejects with UnsupportedError', async () => {
	const { id, dataProducerId, sctpStreamParameters } =
		fakeParameters.generateDataConsumerRemoteParameters();

	await expect(
		ctx.sendTransport!.consumeData({
			id,
			dataProducerId,
			sctpStreamParameters,
		})
	).rejects.toThrow(UnsupportedError);
}, 500);

test('transport.consumeData() with a non object appData rejects with TypeError', async () => {
	const dataConsumerRemoteParameters =
		fakeParameters.generateDataConsumerRemoteParameters();

	await expect(
		ctx.recvTransport!.consumeData({
			dataConsumerRemoteParameters,
			// @ts-expect-error --- On purpose.
			appData: true,
		})
	).rejects.toThrow(TypeError);
}, 500);

test('transport.getStats() succeeds', async () => {
	const stats = await ctx.sendTransport!.getStats();

	expect(typeof stats).toBe('object');
}, 500);

test('transport.restartIce() succeeds', async () => {
	await expect(
		ctx.sendTransport!.restartIce({
			iceParameters: {
				usernameFragment: 'foo',
				password: 'xxx',
			},
		})
	).resolves.toBe(undefined);
}, 500);

test('transport.restartIce() without remote iceParameters rejects with TypeError', async () => {
	// @ts-expect-error --- On purpose.
	await expect(ctx.sendTransport!.restartIce({})).rejects.toThrow(TypeError);
}, 500);

test('transport.updateIceServers() succeeds', async () => {
	await expect(
		ctx.sendTransport!.updateIceServers({ iceServers: [] })
	).resolves.toBe(undefined);
}, 500);

test('transport.updateIceServers() without iceServers rejects with TypeError', async () => {
	await expect(ctx.sendTransport!.updateIceServers({})).rejects.toThrow(
		TypeError
	);
}, 500);

test('ICE gathering state change fires "icegatheringstatechange" in live Transport', () => {
	// NOTE: These tests are a bit flaky and we should isolate them. FakeHandler
	// emits '@connectionstatechange' with value 'connecting' as soon as its
	// private setupTransport() method is called (which has happens many times in
	// tests above already). So here we have to reset it manually to test things.

	// @ts-expect-error --- On purpose.
	ctx.sendTransport!.handler.setIceGatheringState('new');
	// @ts-expect-error --- On purpose.
	ctx.sendTransport!.handler.setConnectionState('new');

	let iceGatheringStateChangeEventNumTimesCalled = 0;
	let connectionStateChangeEventNumTimesCalled = 0;

	ctx.sendTransport!.on('icegatheringstatechange', iceGatheringState => {
		iceGatheringStateChangeEventNumTimesCalled++;

		expect(iceGatheringState).toBe('complete');
		expect(ctx.sendTransport!.iceGatheringState).toBe('complete');
		expect(ctx.sendTransport!.connectionState).toBe('new');
	});

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	ctx.sendTransport!.on('connectionstatechange', connectionState => {
		connectionStateChangeEventNumTimesCalled++;
	});

	// @ts-expect-error --- On purpose.
	ctx.sendTransport!.handler.setIceGatheringState('complete');

	expect(iceGatheringStateChangeEventNumTimesCalled).toBe(1);
	expect(connectionStateChangeEventNumTimesCalled).toBe(0);
	expect(ctx.sendTransport!.iceGatheringState).toBe('complete');
	expect(ctx.sendTransport!.connectionState).toBe('new');
});

test('connection state change fires "connectionstatechange" in live Transport', () => {
	let connectionStateChangeEventNumTimesCalled = 0;

	ctx.sendTransport!.on('connectionstatechange', connectionState => {
		connectionStateChangeEventNumTimesCalled++;

		expect(connectionState).toBe('completed');
	});

	// @ts-expect-error --- On purpose.
	ctx.sendTransport!.handler.setConnectionState('completed');

	expect(connectionStateChangeEventNumTimesCalled).toBe(1);
	expect(ctx.sendTransport!.connectionState).toBe('completed');
});

test('producer.pause() succeeds', () => {
	ctx.videoProducer!.pause();

	expect(ctx.videoProducer!.paused).toBe(true);
	expect(ctx.videoProducer!.track?.enabled).toBe(false);
});

test('producer.resume() succeeds', () => {
	ctx.videoProducer!.resume();

	expect(ctx.videoProducer!.paused).toBe(false);
	expect(ctx.videoProducer!.track?.enabled).toBe(true);
});

test('producer.replaceTrack() with a new track succeeds', async () => {
	// Have the audio Producer paused.
	ctx.audioProducer!.pause();

	const audioProducerPreviousTrack = ctx.audioProducer!.track;
	const newAudioTrack = new FakeMediaStreamTrack({ kind: 'audio' });

	await expect(
		ctx.audioProducer!.replaceTrack({ track: newAudioTrack })
	).resolves.toBe(undefined);

	// Previous track must be 'live' due to stopTracks: false.
	expect(audioProducerPreviousTrack?.readyState).toBe('live');
	expect(ctx.audioProducer!.track?.readyState).toBe('live');
	expect(ctx.audioProducer!.track).not.toBe(audioProducerPreviousTrack);
	expect(ctx.audioProducer!.track).toBe(newAudioTrack);
	// Producer was already paused.
	expect(ctx.audioProducer!.paused).toBe(true);

	// Reset the audio paused state.
	ctx.audioProducer!.resume();

	const videoProducerPreviousTrack = ctx.videoProducer!.track;
	const newVideoTrack = new FakeMediaStreamTrack({ kind: 'video' });

	await expect(
		ctx.videoProducer!.replaceTrack({ track: newVideoTrack })
	).resolves.toBe(undefined);

	// Previous track must be 'ended' due to stopTracks: true.
	expect(videoProducerPreviousTrack?.readyState).toBe('ended');
	expect(ctx.videoProducer!.track).not.toBe(videoProducerPreviousTrack);
	expect(ctx.videoProducer!.track).toBe(newVideoTrack);
	expect(ctx.videoProducer!.paused).toBe(false);
}, 500);

test('producer.replaceTrack() with null succeeds', async () => {
	// Have the audio Producer paused.
	ctx.audioProducer!.pause();

	const audioProducerPreviousTrack = ctx.audioProducer!.track;

	await expect(ctx.audioProducer!.replaceTrack({ track: null })).resolves.toBe(
		undefined
	);

	// Previous track must be 'live' due to stopTracks: false.
	expect(audioProducerPreviousTrack?.readyState).toBe('live');
	expect(ctx.audioProducer!.track).toBeNull();
	// Producer was already paused.
	expect(ctx.audioProducer!.paused).toBe(true);

	// Reset the audio paused state.
	ctx.audioProducer!.resume();

	expect(ctx.audioProducer!.paused).toBe(false);

	// Manually "mute" the original audio track.
	audioProducerPreviousTrack!.enabled = false;

	// Set the original audio track back.
	await expect(
		ctx.audioProducer!.replaceTrack({ track: audioProducerPreviousTrack })
	).resolves.toBe(undefined);

	// The given audio track was muted but the Producer was not, so the track
	// must not be muted now.
	expect(ctx.audioProducer!.paused).toBe(false);
	expect(audioProducerPreviousTrack?.enabled).toBe(true);

	// Reset the audio paused state.
	ctx.audioProducer!.resume();
}, 500);

test('producer.replaceTrack() with an ended track rejects with InvalidStateError', async () => {
	const track = new FakeMediaStreamTrack({ kind: 'audio' });

	track.stop();

	await expect(ctx.videoProducer!.replaceTrack({ track })).rejects.toThrow(
		InvalidStateError
	);

	expect(track.readyState).toBe('ended');
	expect(ctx.videoProducer!.track?.readyState).toBe('live');
}, 500);

test('producer.replaceTrack() with the same track succeeds', async () => {
	await expect(
		ctx.audioProducer!.replaceTrack({ track: ctx.audioProducer!.track })
	).resolves.toBe(undefined);

	expect(ctx.audioProducer!.track?.readyState).toBe('live');
}, 500);

test('producer.setMaxSpatialLayer() succeeds', async () => {
	await expect(ctx.videoProducer!.setMaxSpatialLayer(0)).resolves.toBe(
		undefined
	);

	expect(ctx.videoProducer!.maxSpatialLayer).toBe(0);
}, 500);

test('producer.setMaxSpatialLayer() in an audio Producer rejects with UnsupportedError', async () => {
	await expect(ctx.audioProducer!.setMaxSpatialLayer(1)).rejects.toThrow(
		UnsupportedError
	);

	expect(ctx.audioProducer!.maxSpatialLayer).toBe(undefined);
}, 500);

test('producer.setMaxSpatialLayer() with invalid spatialLayer rejects with TypeError', async () => {
	await expect(
		// @ts-expect-error --- On purpose.
		ctx.videoProducer!.setMaxSpatialLayer('chicken')
	).rejects.toThrow(TypeError);
}, 500);

test('producer.setMaxSpatialLayer() without spatialLayer rejects with TypeError', async () => {
	// @ts-expect-error --- On purpose.
	await expect(ctx.videoProducer!.setMaxSpatialLayer()).rejects.toThrow(
		TypeError
	);
}, 500);

test('producer.setRtpEncodingParameters() succeeds', async () => {
	await expect(
		ctx.videoProducer!.setRtpEncodingParameters({ scaleResolutionDownBy: 2 })
	).resolves.toBe(undefined);
}, 500);

test('producer.getStats() succeeds', async () => {
	const stats = await ctx.videoProducer!.getStats();

	expect(typeof stats).toBe('object');
}, 500);

test('consumer.resume() succeeds', () => {
	ctx.videoConsumer!.resume();

	expect(ctx.videoConsumer!.paused).toBe(false);
});

test('consumer.pause() succeeds', () => {
	ctx.videoConsumer!.pause();

	expect(ctx.videoConsumer!.paused).toBe(true);
});

test('consumer.getStats() succeeds', async () => {
	const stats = await ctx.videoConsumer!.getStats();

	expect(typeof stats).toBe('object');
}, 500);

test('producer.close() succeed', () => {
	ctx.audioProducer!.close();

	expect(ctx.audioProducer!.closed).toBe(true);
	// Track will be still 'live' due to stopTracks: false.
	expect(ctx.audioProducer!.track?.readyState).toBe('live');
});

test('producer.replaceTrack() rejects with InvalidStateError if closed', async () => {
	const audioTrack = new FakeMediaStreamTrack({ kind: 'audio' });

	ctx.audioProducer!.close();

	await expect(
		ctx.audioProducer!.replaceTrack({ track: audioTrack })
	).rejects.toThrow(InvalidStateError);

	expect(audioTrack.readyState).toBe('live');
}, 500);

test('producer.getStats() rejects with InvalidStateError if closed', async () => {
	ctx.audioProducer!.close();

	await expect(ctx.audioProducer!.getStats()).rejects.toThrow(
		InvalidStateError
	);
}, 500);

test('consumer.close() succeed', () => {
	ctx.audioConsumer!.close();

	expect(ctx.audioConsumer!.closed).toBe(true);
	expect(ctx.audioConsumer!.track.readyState).toBe('ended');
});

test('consumer.getStats() rejects with InvalidStateError if closed', async () => {
	ctx.audioConsumer!.close();

	await expect(ctx.audioConsumer!.getStats()).rejects.toThrow(
		InvalidStateError
	);
}, 500);

test('dataProducer.close() succeed', () => {
	ctx.dataProducer!.close();

	expect(ctx.dataProducer!.closed).toBe(true);
});

test('dataConsumer.close() succeed', () => {
	ctx.dataConsumer!.close();

	expect(ctx.dataConsumer!.closed).toBe(true);
});

test('remotetely stopped track fires "trackended" in live Producers/Consumers', () => {
	let audioProducerTrackendedEventCalled = false;
	let videoProducerTrackendedEventCalled = false;
	let audiosConsumerTrackendedEventCalled = false;
	let videoConsumerTrackendedEventCalled = false;

	ctx.audioProducer!.on('trackended', () => {
		audioProducerTrackendedEventCalled = true;
	});

	ctx.videoProducer!.on('trackended', () => {
		videoProducerTrackendedEventCalled = true;
	});

	ctx.audioConsumer!.on('trackended', () => {
		audiosConsumerTrackendedEventCalled = true;
	});

	ctx.videoConsumer!.on('trackended', () => {
		videoConsumerTrackendedEventCalled = true;
	});

	// @ts-expect-error --- On purpose.
	ctx.audioProducer!.track.remoteStop();

	expect(audioProducerTrackendedEventCalled).toBe(true);

	// Let's close the video producer.
	ctx.videoProducer!.close();

	// @ts-expect-error --- On purpose.
	ctx.videoProducer!.track.remoteStop();

	expect(videoProducerTrackendedEventCalled).toBe(false);

	// @ts-expect-error --- On purpose.
	ctx.audioConsumer!.track.remoteStop();

	expect(audiosConsumerTrackendedEventCalled).toBe(true);

	// @ts-expect-error --- On purpose.
	ctx.videoConsumer!.track.remoteStop();

	expect(videoConsumerTrackendedEventCalled).toBe(true);
});

test('transport.close() fires "transportclose" in live Producers/Consumers', () => {
	let audioProducerTransportcloseEventCalled = false;
	let videoProducerTransportcloseEventCalled = false;
	let audioConsumerTransportcloseEventCalled = false;
	let videoConsumerTransportcloseEventCalled = false;

	ctx.audioProducer!.on('transportclose', () => {
		audioProducerTransportcloseEventCalled = true;
	});

	ctx.videoProducer!.on('transportclose', () => {
		videoProducerTransportcloseEventCalled = true;
	});

	ctx.audioConsumer!.on('transportclose', () => {
		audioConsumerTransportcloseEventCalled = true;
	});

	ctx.videoConsumer!.on('transportclose', () => {
		videoConsumerTransportcloseEventCalled = true;
	});

	ctx.connectedSendTransport!.close();

	expect(ctx.connectedSendTransport!.closed).toBe(true);
	expect(ctx.videoProducer!.closed).toBe(true);
	expect(audioProducerTransportcloseEventCalled).toBe(true);
	expect(videoProducerTransportcloseEventCalled).toBe(true);

	// Let's close the video consumer.
	ctx.videoConsumer!.close();
	ctx.connectedRecvTransport!.close();

	expect(ctx.connectedRecvTransport!.closed).toBe(true);
	expect(ctx.videoConsumer!.closed).toBe(true);
	expect(audioConsumerTransportcloseEventCalled).toBe(true);
	expect(videoConsumerTransportcloseEventCalled).toBe(false);
});

test('transport.produce() rejects with InvalidStateError if closed', async () => {
	const track = new FakeMediaStreamTrack({ kind: 'audio' });

	ctx.connectedSendTransport!.close();

	await expect(
		ctx.connectedSendTransport!.produce({ track, stopTracks: false })
	).rejects.toThrow(InvalidStateError);

	// The track must be 'live' due to stopTracks: false.
	expect(track.readyState).toBe('live');
}, 500);

test('transport.consume() rejects with InvalidStateError if closed', async () => {
	ctx.connectedRecvTransport!.close();

	// @ts-expect-error --- On purpose.
	await expect(ctx.connectedRecvTransport!.consume({})).rejects.toThrow(
		InvalidStateError
	);
}, 500);

test('transport.produceData() rejects with InvalidStateError if closed', async () => {
	ctx.connectedSendTransport!.close();

	await expect(ctx.connectedSendTransport!.produceData({})).rejects.toThrow(
		InvalidStateError
	);
}, 500);

test('transport.consumeData() rejects with InvalidStateError if closed', async () => {
	ctx.connectedRecvTransport!.close();

	// @ts-expect-error --- On purpose.
	await expect(ctx.connectedRecvTransport!.consumeData({})).rejects.toThrow(
		InvalidStateError
	);
}, 500);

test('transport.getStats() rejects with InvalidStateError if closed', async () => {
	ctx.connectedSendTransport!.close();

	await expect(ctx.connectedSendTransport!.getStats()).rejects.toThrow(
		InvalidStateError
	);
}, 500);

test('transport.restartIce() rejects with InvalidStateError if closed', async () => {
	ctx.connectedSendTransport!.close();

	await expect(
		// @ts-expect-error --- On purpose.
		ctx.connectedSendTransport!.restartIce({ ieParameters: {} })
	).rejects.toThrow(InvalidStateError);
}, 500);

test('transport.updateIceServers() rejects with InvalidStateError if closed', async () => {
	ctx.connectedSendTransport!.close();

	await expect(
		ctx.connectedSendTransport!.updateIceServers({ iceServers: [] })
	).rejects.toThrow(InvalidStateError);
}, 500);

test('connection state change does not fire "connectionstatechange" in closed Transport', () => {
	let connectionStateChangeEventNumTimesCalled = 0;

	ctx.connectedSendTransport!.on(
		'connectionstatechange',
		(/* connectionState */) => {
			connectionStateChangeEventNumTimesCalled++;
		}
	);

	ctx.connectedSendTransport!.close();

	// @ts-expect-error --- On purpose.
	ctx.connectedSendTransport!.handler.setConnectionState('disconnected');

	expect(connectionStateChangeEventNumTimesCalled).toBe(0);
	expect(ctx.connectedSendTransport!.connectionState).toBe('disconnected');
});

test('RemoteSdp properly handles multiple streams of the same type in planB', () => {
	let sdp = undefined;
	let sdpObject = undefined;

	const remoteSdp = new RemoteSdp({ planB: true });

	remoteSdp.receive({
		mid: 'video',
		kind: 'video',
		offerRtpParameters: fakeParameters.generateConsumerRemoteParameters({
			codecMimeType: 'video/VP8',
		}).rtpParameters,
		streamId: 'streamId-1',
		trackId: 'trackId-1',
	});

	sdp = remoteSdp.getSdp();
	sdpObject = sdpTransform.parse(sdp);

	expect(sdpObject.media.length).toBe(1);
	expect(sdpObject.media[0].payloads).toBe('101 102');
	expect(sdpObject.media[0].rtp.length).toBe(2);
	expect(sdpObject.media[0].rtp[0].payload).toBe(101);
	expect(sdpObject.media[0].rtp[0].codec).toBe('VP8');
	expect(sdpObject.media[0].rtp[1].payload).toBe(102);
	expect(sdpObject.media[0].rtp[1].codec).toBe('rtx');
	expect(sdpObject.media[0].ssrcs?.length).toBe(4);

	remoteSdp.receive({
		mid: 'video',
		kind: 'video',
		offerRtpParameters: fakeParameters.generateConsumerRemoteParameters({
			codecMimeType: 'video/H264',
		}).rtpParameters,
		streamId: 'streamId-2',
		trackId: 'trackId-2',
	});

	sdp = remoteSdp.getSdp();
	sdpObject = sdpTransform.parse(sdp);

	expect(sdpObject.media.length).toBe(1);
	expect(sdpObject.media[0].payloads).toBe('101 102 103 104');
	expect(sdpObject.media[0].rtp.length).toBe(4);
	expect(sdpObject.media[0].rtp[0].payload).toBe(101);
	expect(sdpObject.media[0].rtp[0].codec).toBe('VP8');
	expect(sdpObject.media[0].rtp[1].payload).toBe(102);
	expect(sdpObject.media[0].rtp[1].codec).toBe('rtx');
	expect(sdpObject.media[0].rtp[2].payload).toBe(103);
	expect(sdpObject.media[0].rtp[2].codec).toBe('H264');
	expect(sdpObject.media[0].rtp[3].payload).toBe(104);
	expect(sdpObject.media[0].rtp[3].codec).toBe('rtx');
	expect(sdpObject.media[0].ssrcs?.length).toBe(8);

	remoteSdp.planBStopReceiving({
		mid: 'video',
		offerRtpParameters: fakeParameters.generateConsumerRemoteParameters({
			codecMimeType: 'video/H264',
		}).rtpParameters,
	});

	sdp = remoteSdp.getSdp();
	sdpObject = sdpTransform.parse(sdp);

	expect(sdpObject.media.length).toBe(1);
	expect(sdpObject.media[0].payloads).toBe('101 102 103 104');
	expect(sdpObject.media[0].rtp.length).toBe(4);
	expect(sdpObject.media[0].rtp[0].payload).toBe(101);
	expect(sdpObject.media[0].rtp[0].codec).toBe('VP8');
	expect(sdpObject.media[0].rtp[1].payload).toBe(102);
	expect(sdpObject.media[0].rtp[1].codec).toBe('rtx');
	expect(sdpObject.media[0].rtp[2].payload).toBe(103);
	expect(sdpObject.media[0].rtp[2].codec).toBe('H264');
	expect(sdpObject.media[0].rtp[3].payload).toBe(104);
	expect(sdpObject.media[0].rtp[3].codec).toBe('rtx');
	expect(sdpObject.media[0].ssrcs?.length).toBe(4);
}, 500);

test('RemoteSdp does not duplicate codec descriptions', () => {
	let sdp = undefined;
	let sdpObject = undefined;

	const remoteSdp = new RemoteSdp({ planB: true });

	remoteSdp.receive({
		mid: 'video',
		kind: 'video',
		offerRtpParameters: fakeParameters.generateConsumerRemoteParameters({
			codecMimeType: 'video/VP8',
		}).rtpParameters,
		streamId: 'streamId-1',
		trackId: 'trackId-1',
	});

	sdp = remoteSdp.getSdp();
	sdpObject = sdpTransform.parse(sdp);

	expect(sdpObject.media.length).toBe(1);
	expect(sdpObject.media[0].payloads).toBe('101 102');
	expect(sdpObject.media[0].rtp.length).toBe(2);
	expect(sdpObject.media[0].rtp[0].payload).toBe(101);
	expect(sdpObject.media[0].rtp[0].codec).toBe('VP8');
	expect(sdpObject.media[0].rtp[1].payload).toBe(102);
	expect(sdpObject.media[0].rtp[1].codec).toBe('rtx');
	expect(sdpObject.media[0].ssrcs?.length).toBe(4);

	remoteSdp.receive({
		mid: 'video',
		kind: 'video',
		offerRtpParameters: fakeParameters.generateConsumerRemoteParameters({
			codecMimeType: 'video/VP8',
		}).rtpParameters,
		streamId: 'streamId-1',
		trackId: 'trackId-1',
	});

	sdp = remoteSdp.getSdp();
	sdpObject = sdpTransform.parse(sdp);

	expect(sdpObject.media.length).toBe(1);
	expect(sdpObject.media[0].payloads).toBe('101 102');
	expect(sdpObject.media[0].rtp.length).toBe(2);
	expect(sdpObject.media[0].rtp[0].payload).toBe(101);
	expect(sdpObject.media[0].rtp[0].codec).toBe('VP8');
	expect(sdpObject.media[0].rtp[1].payload).toBe(102);
	expect(sdpObject.media[0].rtp[1].codec).toBe('rtx');
	expect(sdpObject.media[0].ssrcs?.length).toBe(8);
}, 500);

test('parseScalabilityMode() works', () => {
	expect(parseScalabilityMode('L1T3')).toEqual({
		spatialLayers: 1,
		temporalLayers: 3,
	});
	expect(parseScalabilityMode('L3T2_KEY')).toEqual({
		spatialLayers: 3,
		temporalLayers: 2,
	});
	expect(parseScalabilityMode('S2T3')).toEqual({
		spatialLayers: 2,
		temporalLayers: 3,
	});
	expect(parseScalabilityMode('foo')).toEqual({
		spatialLayers: 1,
		temporalLayers: 1,
	});
	expect(parseScalabilityMode()).toEqual({
		spatialLayers: 1,
		temporalLayers: 1,
	});
	expect(parseScalabilityMode('S0T3')).toEqual({
		spatialLayers: 1,
		temporalLayers: 1,
	});
	expect(parseScalabilityMode('S1T0')).toEqual({
		spatialLayers: 1,
		temporalLayers: 1,
	});
	expect(parseScalabilityMode('L20T3')).toEqual({
		spatialLayers: 20,
		temporalLayers: 3,
	});
	expect(parseScalabilityMode('S200T3')).toEqual({
		spatialLayers: 1,
		temporalLayers: 1,
	});
});

describe('detectDevice() assigns proper handler based on UserAgent', () => {
	for (const uaTestCase of uaTestCases) {
		test(
			// eslint-disable-next-line jest/valid-title --- Jest is not that smart.
			uaTestCase.desc,
			() => {
				const originalRTCRtpTransceiver = global.RTCRtpTransceiver;

				// We need to force presence of RTCRtpTransceiver to test Safari 12.
				if (uaTestCase.expect === 'Safari12') {
					global.RTCRtpTransceiver = class Dummy {
						currentDirection() {}
					} as any;
				}

				expect(detectDevice(uaTestCase.ua)).toBe(uaTestCase.expect);

				// Cleanup.
				global.RTCRtpTransceiver = originalRTCRtpTransceiver;
			},
			100
		);
	}
});
