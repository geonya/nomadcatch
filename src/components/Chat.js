import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useLocation, useNavigate } from 'react-router-dom';
import io from 'socket.io-client';
import styled from 'styled-components';
import queryString from 'query-string';

let socket;
const SERVER_URL =
  process.env.NODE_ENV === 'production'
    ? 'https://nomadcatch.herokuapp.com/'
    : 'http://localhost:4444/';
export default function Chat() {
  const location = useLocation();
  // video
  const myVideoRef = useRef();
  const peerVideoRef = useRef();

  // canvas
  const canvasBoardRef = useRef();
  const cavasContainerRef = useRef();
  const colorPickRefs = useRef([]);
  const eraserRef = useRef();
  const colors = [
    '#c0392b',
    '#e67e22',
    '#f1c40f',
    '#2ecc71',
    '#3498db',
    'blueviolet',
    '#e84393',
    '#2c3e50',
  ];
  const [name, setName] = useState('');
  const [hostName, setHostName] = useState('');
  const [room, setRoom] = useState('');
  const [users, setUsers] = useState([]);
  const [messages, setMessages] = useState([]);
  const [question, setQuestion] = useState('');
  const [myMuted, setMyMuted] = useState(false);
  const [peerMuted, setPeerMuted] = useState(false);
  const [myStream, setMyStream] = useState();
  const { register, handleSubmit, setValue } = useForm();
  const navigate = useNavigate();

  useEffect(() => {
    const { name, room } = queryString.parse(location.search);
    socket = io(SERVER_URL);
    setRoom(room);
    setName(name);
    socket.emit('join', { name, room }, (error) => {
      socket.emit('rtc_start', room);
      if (error) {
        alert(error);
        navigate('/');
        console.error(error);
      }
    });
  }, [location.search, navigate]);

  // Room Data
  useEffect(() => {
    socket.on('message', (message) => {
      setMessages((messages) => [...messages, message]);
    });
    socket.on('question', ({ question, name }) => {
      setHostName(name);
      setQuestion(question);
    });
  }, []);

  // Room Data

  useEffect(() => {
    socket.on('roomData', ({ room, users }) => {
      setRoom(room);
      setUsers(users);
    });
  }, []);

  // Question Answer

  useEffect(() => {
    socket.on('check-answer', ({ message, name }) => {
      if (!message || !question) return;
      if (hostName === name) return;
      if (message.includes(question)) {
        socket.emit('correct', name);
      }
    });
  }, [question, hostName]);

  // media setup
  useEffect(() => {
    let stream;
    let peerConnection;
    let dataChannel;
    let context;
    let painting = false;
    let pickedColor = '#2c3e50';
    let lineWidth = 4;

    peerConnection = new RTCPeerConnection();
    const startMedia = async () => {
      const getMedia = async () => {
        const contraints = { audio: true, video: { facingMode: 'user' } };
        try {
          stream = await navigator.mediaDevices.getUserMedia(contraints);
          if (myVideoRef.current) {
            myVideoRef.current.srcObject = stream;
          }
          setMyStream(stream);
        } catch (error) {
          console.error(error);
        }
      };
      const makeConnection = () => {
        if (stream) {
          stream
            .getTracks()
            .forEach((track) => peerConnection.addTrack(track, stream));
        }
      };
      await getMedia();
      makeConnection();
    };

    startMedia();

    peerConnection.ontrack = ({ streams }) => {
      if (peerVideoRef.current) {
        peerVideoRef.current.srcObject = streams[0];
      }
    };

    myVideoRef.current.addEventListener('click', handleCameraOut);

    socket.on('rtc_start', async (room) => {
      canvasClear();
      console.log('RTC Connection Start!');
      peerConnection.addEventListener('icecandidate', ({ candidate }) => {
        console.log('candidate finish');
        socket.emit('candidate', { candidate, room });
      });
      dataChannel = peerConnection.createDataChannel('canvas');

      dataChannel.onmessage = (event) => {
        console.log('data receiving...');
        const parsed = JSON.parse(event.data);
        peerPainting(parsed.payload);
      };
      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);
      socket.emit('offer', { offer, room });
      console.log('send the offer');
    });
    socket.on('offer', async ({ offer, room }) => {
      canvasClear();
      peerConnection.addEventListener('datachannel', (event) => {
        console.log('receive datachannel');
        dataChannel = event.channel;
        if (dataChannel) {
          dataChannel.onmessage = (event) => {
            console.log('data receiving...');
            const parsed = JSON.parse(event.data);
            peerPainting(parsed.payload);
          };
        }
      });
      await peerConnection.setRemoteDescription(offer);
      console.log('receive offer');
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);
      socket.emit('answer', { answer, room });
      console.log('send answer!');
    });

    socket.on('answer', async ({ answer, room }) => {
      peerConnection.addEventListener('icecandidate', ({ candidate }) => {
        console.log('candidate finish');
        socket.emit('candidate', { candidate, room });
      });
      console.log('receive answer');
      await peerConnection.setRemoteDescription(answer);
    });

    socket.on('candidate', async (candidate) => {
      console.log('receive candidate !');
      if (candidate) {
        await peerConnection.addIceCandidate(candidate);
        console.log('🚀 add ice candidate peer connection finish 🚀 ');
      }
    });

    const makeCanvas = () => {
      context = canvasBoardRef.current.getContext('2d');
      context.lineCap = 'round';

      canvasBoardRef.current.width = cavasContainerRef.current.clientWidth;
      canvasBoardRef.current.height = cavasContainerRef.current.clientHeight;

      if (!canvasBoardRef.current) return;
      if (!context) return;
      // mouse event

      canvasBoardRef.current.addEventListener('mousedown', readyPainting);
      canvasBoardRef.current.addEventListener('mousemove', beginPainting);
      canvasBoardRef.current.addEventListener('mouseup', stopPainting);
      canvasBoardRef.current.addEventListener('mouseout', stopPainting);

      // touch event
      canvasBoardRef.current.addEventListener('touchstart', readyPainting);
      canvasBoardRef.current.addEventListener('touchmove', beginPainting);
      canvasBoardRef.current.addEventListener('touchend', stopPainting);

      if (colorPickRefs.current) {
        colorPickRefs.current.map((element) =>
          element.addEventListener('click', (event) => {
            lineWidth = 4;
            if (event.target) {
              pickedColor = event.target.id;
            }
          })
        );
      }
      if (eraserRef.current) {
        eraserRef.current.onclick = () => {
          pickedColor = 'white';
          lineWidth = 20;
        };
      }
    };

    function readyPainting(ev) {
      ev.preventDefault();
      const mousePos = getMosuePositionOnCanvas(ev);
      context.beginPath();
      context.moveTo(mousePos.x, mousePos.y);
      context.lineWidth = lineWidth;
      context.strokeStyle = pickedColor;
      painting = true;
      const data = {
        x: mousePos.x,
        y: mousePos.y,
        lineWidth,
        color: pickedColor,
        painting: false,
      };
      if (dataChannel) {
        console.log('send data');
        dataChannel.send(
          JSON.stringify({ type: 'ready', payload: { ...data } })
        );
      }
    }

    function beginPainting(ev) {
      ev.preventDefault();
      if (painting) {
        const mousePos = getMosuePositionOnCanvas(ev);
        context.lineTo(mousePos.x, mousePos.y);
        context.stroke();
        const data = {
          x: mousePos.x,
          y: mousePos.y,
          lineWidth,
          color: pickedColor,
          painting: true,
        };
        if (dataChannel) {
          dataChannel.send(
            JSON.stringify({ type: 'begin', payload: { ...data } })
          );
        }
      }
    }

    function stopPainting(ev) {
      ev.preventDefault();
      if (painting) {
        context.stroke();
      }
      painting = false;
    }

    function getMosuePositionOnCanvas(ev) {
      if (ev.touches) {
        return {
          x: ev.touches[0].clientX - ev.target.parentNode.offsetLeft,
          y: ev.touches[0].clientY - ev.target.parentNode.offsetHeight + 25,
        };
      }
      return { x: ev.offsetX, y: ev.offsetY };
    }
    function peerPainting(payload) {
      if (!context) return;
      context.strokeStyle = payload.color;
      context.lineWidth = payload.lineWidth;
      context.lineCap = payload.lineCap;
      if (!payload.painting) {
        context.beginPath();
        context.moveTo(payload.x, payload.y);
      } else {
        context.lineTo(payload.x, payload.y);
        context.stroke();
      }
    }

    function canvasClear() {
      if (!context) return;
      if (!canvasBoardRef.current) return;
      context.clearRect(
        0,
        0,
        canvasBoardRef.current.width,
        canvasBoardRef.current.height
      );
    }

    function handleCameraOut() {
      stream
        .getVideoTracks()
        .forEach((track) => (track.enabled = !track.enabled));
    }

    makeCanvas();
  }, []);

  const onValid = ({ message }) => {
    socket.emit('sendMessage', message);
    setValue('message', '');
  };

  function handleMyMuted() {
    if (myStream) {
      myStream
        .getAudioTracks()
        .forEach((track) => (track.enabled = !track.enabled));
    }
    setMyMuted((prev) => !prev);
  }
  function handlePeerMuted() {
    setPeerMuted((prev) => !prev);
  }

  const messageEndRef = useRef();
  useEffect(() => {
    messageEndRef.current.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const pageEndRef = useRef();
  useEffect(() => {
    pageEndRef.current.scrollIntoView({ behavior: 'smooth' });
  }, []);
  return (
    <Layout>
      <Container>
        <Header>
          <TitleBox>
            <h1>Nomad Catch</h1>
            <h3>Room : {room}</h3>
          </TitleBox>
          {users ? (
            <Users>
              {users.map(({ name: username }) => (
                <div key={username}>
                  {name === username ? (
                    <>
                      <OnlineIcon />
                      <span>me</span>
                      <button onClick={() => handleMyMuted()}>
                        {myMuted ? (
                          <svg
                            fill='none'
                            stroke='currentColor'
                            viewBox='0 0 24 24'
                            xmlns='http://www.w3.org/2000/svg'
                          >
                            <path
                              strokeLinecap='round'
                              strokeLinejoin='round'
                              strokeWidth='2'
                              d='M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z'
                              clipRule='evenodd'
                            ></path>
                            <path
                              strokeLinecap='round'
                              strokeLinejoin='round'
                              strokeWidth='2'
                              d='M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2'
                            ></path>
                          </svg>
                        ) : (
                          <svg
                            fill='none'
                            stroke='currentColor'
                            viewBox='0 0 24 24'
                            xmlns='http://www.w3.org/2000/svg'
                          >
                            <path
                              strokeLinecap='round'
                              strokeLinejoin='round'
                              strokeWidth='2'
                              d='M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z'
                            ></path>
                          </svg>
                        )}
                      </button>
                    </>
                  ) : (
                    <>
                      <OnlineIcon />
                      <span>{username}</span>
                      <button onClick={() => handlePeerMuted()}>
                        {peerMuted ? (
                          <svg
                            fill='none'
                            stroke='currentColor'
                            viewBox='0 0 24 24'
                            xmlns='http://www.w3.org/2000/svg'
                          >
                            <path
                              strokeLinecap='round'
                              strokeLinejoin='round'
                              strokeWidth='2'
                              d='M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z'
                              clipRule='evenodd'
                            ></path>
                            <path
                              strokeLinecap='round'
                              strokeLinejoin='round'
                              strokeWidth='2'
                              d='M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2'
                            ></path>
                          </svg>
                        ) : (
                          <svg
                            fill='none'
                            stroke='currentColor'
                            viewBox='0 0 24 24'
                            xmlns='http://www.w3.org/2000/svg'
                          >
                            <path
                              strokeLinecap='round'
                              strokeLinejoin='round'
                              strokeWidth='2'
                              d='M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z'
                            ></path>
                          </svg>
                        )}
                      </button>
                    </>
                  )}
                </div>
              ))}
            </Users>
          ) : null}
          <a href='/'>
            <OutButton>Exit</OutButton>
          </a>
        </Header>
        <VideoContainer>
          <VideoBox>
            <video ref={myVideoRef} autoPlay muted={myMuted} />
          </VideoBox>
          <StartButton
            onClick={() => {
              socket.emit('question', { room, name });
              socket.emit('rtc_start', room);
            }}
          >
            Start!
          </StartButton>
          <VideoBox>
            <video ref={peerVideoRef} autoPlay muted={peerMuted} />
          </VideoBox>
        </VideoContainer>
        <CanvasContainer ref={cavasContainerRef}>
          <CanvasBoard ref={canvasBoardRef} />
          <ToolBox>
            {name === hostName ? <Question>Q. {question}</Question> : null}
          </ToolBox>
          <ColorsPickBox>
            {colors.map((color, i) => {
              return (
                <ColorPick
                  id={color}
                  key={i}
                  color={color}
                  ref={(element) => {
                    if (element) {
                      colorPickRefs.current[i] = element;
                    }
                  }}
                />
              );
            })}
            <Eraser ref={eraserRef}>
              <svg width='24' height='24' xmlns='http://www.w3.org/2000/svg'>
                <path d='M5.662 23l-5.369-5.365c-.195-.195-.293-.45-.293-.707 0-.256.098-.512.293-.707l14.929-14.928c.195-.194.451-.293.707-.293.255 0 .512.099.707.293l7.071 7.073c.196.195.293.451.293.708 0 .256-.097.511-.293.707l-11.216 11.219h5.514v2h-12.343zm3.657-2l-5.486-5.486-1.419 1.414 4.076 4.072h2.829zm6.605-17.581l-10.677 10.68 5.658 5.659 10.676-10.682-5.657-5.657z' />
              </svg>
            </Eraser>
          </ColorsPickBox>
        </CanvasContainer>
        <MessagesContainer>
          <MessagesBox>
            {messages.map((message, i) => (
              <div key={i}>
                <span>{message.user}</span>
                <span>{message.text}</span>
                <span>{message.time}</span>
              </div>
            ))}
            <div ref={messageEndRef} />
          </MessagesBox>

          <MessageForm onSubmit={handleSubmit(onValid)}>
            <MessageInput
              {...register('message', { required: true })}
              placeholder='메시지를 입력하세요.'
            />
            <MessageButton>
              <svg
                fill='none'
                stroke='currentColor'
                viewBox='0 0 24 24'
                xmlns='http://www.w3.org/2000/svg'
              >
                <path
                  strokeLinecap='round'
                  strokeLinejoin='round'
                  strokeWidth='2'
                  d='M5 10l7-7m0 0l7 7m-7-7v18'
                ></path>
              </svg>
            </MessageButton>
          </MessageForm>
        </MessagesContainer>
      </Container>
      <div ref={pageEndRef} />
    </Layout>
  );
}

const Layout = styled.div`
  margin: 0 auto;
  max-width: 350px;
  width: 100%;
  height: 645px;
`;
const Container = styled.div`
  margin: auto;
  border-radius: 20px;
  box-shadow: 0 4px 6px rgba(50, 50, 93, 0.11), 0 1px 3px rgba(0, 0, 0, 0.08);
  display: flex;
  flex-direction: column;
  align-items: center;
`;

const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  background-color: blueviolet;
  width: 100%;
  padding: 10px 20px;
  border-radius: 20px;
  box-shadow: 0 4px 6px rgba(50, 50, 93, 0.11), 0 1px 3px rgba(0, 0, 0, 0.08);
  h1 {
    font-size: 16px;
    font-weight: 600;
    color: white;
  }
`;

const TitleBox = styled.div`
  h3 {
    margin-top: 5px;
    margin-left: 10px;
    font-size: 10px;
    color: white;
  }
`;
const Users = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  grid-gap: 13px;
  div {
    display: flex;
    align-items: center;
    span {
      max-width: 40px;
      word-break: break-all;
      font-size: 12px;
      font-weight: 600;
      color: white;
    }
    button {
      margin-left: 5px;
      display: flex;
      align-items: center;
      color: white;
      width: 16px;
      height: 16px;
      svg {
        width: 16px;
        height: 16px;
      }
    }
  }
`;
const OnlineIcon = styled.div`
  width: 5px;
  height: 5px;
  border-radius: 50%;
  margin-right: 6px;
  background-color: greenyellow;
  box-shadow: 0 4px 6px rgba(50, 50, 93, 0.11), 0 1px 3px rgba(0, 0, 0, 0.08);
`;
const OutButton = styled.button`
  background-color: white;
  color: blueviolet;
  width: 35px;
  height: 35px;
  border-radius: 50%;
  text-align: center;
  font-size: 10px;
  box-shadow: 0 4px 6px rgba(50, 50, 93, 0.11), 0 1px 3px rgba(0, 0, 0, 0.08);
`;

const VideoContainer = styled.div`
  width: 100%;
  height: 150px;
  display: flex;
  justify-content: space-around;
  align-items: center;
`;

const VideoBox = styled.div`
  background-color: blueviolet;
  width: 110px;
  height: 110px;
  border-radius: 50%;
  z-index: 999;
  bottom: -50px;
  right: 0;
  box-shadow: 0 4px 6px rgba(50, 50, 93, 0.11), 0 1px 3px rgba(0, 0, 0, 0.08);
  display: flex;
  justify-content: center;
  align-items: center;
  overflow: hidden;
  video {
    width: 149px;
    height: 149px;
    cursor: pointer;
  }
`;

const StartButton = styled.button`
  align-self: flex-end;
  cursor: pointer;
  background-color: tomato;
  color: white;
  width: 50px;
  height: 50px;
  border-radius: 50%;
  text-align: center;
  margin-bottom: 10px;
  box-shadow: 0 4px 6px rgba(50, 50, 93, 0.11), 0 1px 3px rgba(0, 0, 0, 0.08);
`;

const CanvasContainer = styled.div`
  border: 1px solid rgba(0, 0, 0, 0.1);
  box-shadow: 0 4px 6px rgba(50, 50, 93, 0.11), 0 1px 3px rgba(0, 0, 0, 0.08);
  width: 95%;
  height: 250px;
  border-radius: 18px;
  position: relative;
  background-color: white;
`;
const CanvasBoard = styled.canvas``;

const ColorsPickBox = styled.div`
  position: absolute;
  left: 50%;
  bottom: 5px;
  display: flex;
  transform: translate(-50%, 0);
`;
const ColorPick = styled.div`
  cursor: pointer;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  z-index: 999;
  background-color: ${(props) => props.color};
  margin-right: 5px;
  box-shadow: 0 4px 6px rgba(50, 50, 93, 0.11), 0 1px 3px rgba(0, 0, 0, 0.08);
`;

const ToolBox = styled.div`
  position: absolute;
  left: 50%;
  top: 5px;
  display: flex;
  transform: translate(-50%, 0);
`;
const Eraser = styled.div`
  cursor: pointer;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  display: flex;
  justify-content: center;
  align-items: center;
  margin-right: -5px;
`;
const Question = styled.div`
  margin-top: 3px;
  box-shadow: 0 4px 6px rgba(50, 50, 93, 0.11), 0 1px 3px rgba(0, 0, 0, 0.08);
  cursor: pointer;
  padding: 4px 10px;
  border-radius: 10px;
  display: flex;
  justify-content: center;
  align-items: center;
  font-size: 13px;
`;

const MessagesContainer = styled.div`
  margin-top: 5px;
  width: 100%;
  display: flex;
  flex-direction: column;
  justify-content: center;
  position: relative;
`;

const MessagesBox = styled.div`
  margin-top: 13px;
  width: 95%;
  height: 170px;
  padding: 0px 10px 56px 10px;
  overflow-y: scroll;
  border-radius: 18px;
  div {
    width: 100%;
    display: grid;
    grid-template-columns: 1fr 6fr 1fr;
    grid-gap: 3px;
    color: gray;
    span:nth-child(1) {
      align-self: flex-start;
      color: blueviolet;
      font-size: 12px;
      font-weight: 600;
    }
    span:nth-child(2) {
      align-self: center;
      color: gray;
      font-size: 13px;
    }
    span:nth-child(3) {
      place-self: flex-end;
      align-self: center;
      color: gray;
      font-size: 10px;
    }
  }
`;
const MessageForm = styled.form`
  width: 95%;
  position: absolute;
  bottom: 10px;
  left: 50%;
  transform: translate(-50%, 0%);
`;
const MessageInput = styled.input`
  margin-left: 10px;
  width: 90%;
  padding: 12px;
  border-radius: 10px;
  border: 1px solid rgba(0, 0, 0, 0.2);
  box-shadow: 0 4px 6px rgba(50, 50, 93, 0.11), 0 1px 3px rgba(0, 0, 0, 0.08);
  font-size: 12px;
`;
const MessageButton = styled.button`
  width: 35px;
  height: 35px;
  position: absolute;
  right: 15px;
  bottom: 2.5px;
  background-color: blueviolet;
  color: white;
  border-radius: 50%;
  box-shadow: 0 4px 6px rgba(50, 50, 93, 0.11), 0 1px 3px rgba(0, 0, 0, 0.08);
  display: flex;
  justify-content: center;
  align-items: center;
  svg {
    width: 18px;
    height: 18px;
  }
`;
